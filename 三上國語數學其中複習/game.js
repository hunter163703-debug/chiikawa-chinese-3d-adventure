// ============================================================================
// 國小三年級寶可夢訓練道館 — 主遊戲引擎 (game.js)
// 100% 參考 https://infinite-pokemon-blond.vercel.app/game/ 製作
// 包含：
// 1. 初始三選一（皮卡丘、噴火龍、妙蛙種子，初始 Lv.1 未受訓狀態）
// 2. 柳溪主城鎮（國語文道館、數學道館、寶可夢商店）與即時狀態列 / START 選單
// 3. 五大區域地圖與等級分級（柳溪 Lv.3~5 → 克洛佛班克河 Lv.7~10 → 低雨林小徑 Lv.12~16 → 桑布雷克海岸 Lv.18~23 → 韋斯頓露台 Lv.25~32）
// 4. 16 個地圖金幣寶箱與寶可夢商店特殊道具購買系統
// 5. GBA 經典回合制對戰與約 60% 基礎收服率機制
// ============================================================================

(function () {
  "use strict";

  const DATA = window.GAME_DATA;
  const SAVE_KEY = "G3_POKEMON_WILLOW_VALLEY_V2";
  const MAP_COLS = 32;
  const MAP_ROWS = 24;
  const TILE_SIZE = 16;

  // 內建 terrain.json 圖塊定義（免除 file:// 協定下 fetch CORS 問題）
  const TERRAIN_META = {
    columns: 32,
    blocks: {
      tree: [[14, 15], [28, 29], [36, 37]],
      house: [
        [641, 642, 642, 642, 643],
        [649, 650, 650, 650, 651],
        [657, 659, 658, 658, 660],
        [664, 665, 666, 667, 668],
        [672, 675, 674, 673, 676]
      ],
      lab: [
        [680, 681, 681, 681, 681, 701, 693],
        [688, 689, 689, 689, 689, 691, 692],
        [696, 697, 697, 697, 697, 699, 700],
        [704, 705, 720, 706, 707, 708, 709],
        [712, 713, 728, 684, 715, 716, 717]
      ],
      mailbox: [[677], [685]],
      fence: [[644, 644, 644, 644]],
      pond: [[416, 417, 418], [424, 425, 426], [432, 433, 434]]
    }
  };

  // --------------------------------------------------------------------------
  // 1. 音效與台灣繁體中文語音合成系統 (SoundSystem)
  // --------------------------------------------------------------------------
  class SoundSystem {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }
    playTone(freq, duration = 0.1, type = "square", vol = 0.08, delay = 0) {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + duration);
      } catch (e) {}
    }
    playClick() { this.playTone(660, 0.06, "square", 0.06); }
    playStep() { this.playTone(240, 0.03, "triangle", 0.03); }
    playCorrect() {
      this.playTone(523.25, 0.09, "square", 0.08, 0);
      this.playTone(659.25, 0.09, "square", 0.08, 0.09);
      this.playTone(783.99, 0.12, "square", 0.09, 0.18);
      this.playTone(1046.5, 0.25, "square", 0.10, 0.28);
    }
    playWrong() {
      this.playTone(220, 0.15, "sawtooth", 0.08, 0);
      this.playTone(165, 0.25, "sawtooth", 0.08, 0.15);
    }
    playHeal() {
      this.playTone(523.25, 0.12, "sine", 0.09, 0);
      this.playTone(659.25, 0.12, "sine", 0.09, 0.13);
      this.playTone(783.99, 0.14, "sine", 0.09, 0.26);
      this.playTone(1046.5, 0.30, "sine", 0.10, 0.40);
    }
    playAttack() {
      this.playTone(180, 0.08, "sawtooth", 0.10, 0);
      this.playTone(120, 0.12, "square", 0.10, 0.06);
    }
    playChest() {
      this.playTone(587.33, 0.08, "square", 0.08, 0);
      this.playTone(783.99, 0.08, "square", 0.08, 0.08);
      this.playTone(987.77, 0.12, "square", 0.09, 0.16);
      this.playTone(1174.66, 0.25, "square", 0.10, 0.25);
    }
    playBallThrow() {
      this.playTone(400, 0.08, "sine", 0.08, 0);
      this.playTone(600, 0.08, "sine", 0.08, 0.08);
      this.playTone(800, 0.10, "sine", 0.08, 0.16);
    }
    playCaptureSuccess() {
      this.playTone(523.25, 0.10, "square", 0.09, 0);
      this.playTone(587.33, 0.10, "square", 0.09, 0.11);
      this.playTone(659.25, 0.10, "square", 0.09, 0.22);
      this.playTone(783.99, 0.32, "square", 0.11, 0.33);
    }
    speak(text) {
      if (!("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "zh-TW";
        u.rate = 0.88;
        u.pitch = 1.05;
        const voices = window.speechSynthesis.getVoices();
        const twVoice = voices.find((v) => v.lang.includes("zh-TW") || v.lang.includes("zh_TW") || v.name.includes("Taiwan"));
        if (twVoice) u.voice = twVoice;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
  }

  const SFX = new SoundSystem();

  // --------------------------------------------------------------------------
  // 2. 圖片資源載入 (assets/classic/* 與 assets/trainer.png & PMD / PokeAPI)
  // --------------------------------------------------------------------------
  const IMAGES = {};
  function preloadAssets() {
    const list = [
      ["terrain", "assets/classic/terrain.png"],
      ["interior", "assets/classic/interior/tiles.png"],
      ["trainer", "assets/trainer.png"],
      ["people/prof_oak", "assets/classic/people/prof_oak.png"],
      ["people/youngster", "assets/classic/people/youngster.png"],
      ["people/nurse", "assets/classic/people/nurse.png"],
      ["people/hiker", "assets/classic/people/hiker.png"],
      ["people/lass", "assets/classic/people/lass.png"],
      ["people/fisher", "assets/classic/people/fisher.png"],
      ["people/scientist", "assets/classic/people/scientist.png"]
    ];
    list.forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      IMAGES[key] = img;
    });
  }
  preloadAssets();

  function getPortraitUrl(id4) {
    return `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/${id4}/Normal.png`;
  }
  function getStaticSpriteUrl(id, back = false) {
    return back
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`
      : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  }
  function getAnimSpriteUrl(id, back = false) {
    return back
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/${id}.gif`
      : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;
  }

  // --------------------------------------------------------------------------
  // 3. 玩家存檔與遊戲狀態 (GameState)
  // --------------------------------------------------------------------------
  let selectedStarterId = 25; // 預設皮卡丘 (25: 皮卡丘, 6: 噴火龍, 1: 妙蛙種子)

  function createPokemonInstance(catId, customLv = null, isStarter = false) {
    const cat = DATA.pokemonCatalog.find((p) => p.id === catId) || DATA.pokemonCatalog[0];
    const lv = customLv !== null ? customLv : cat.minLv;
    // 主角初始寶可夢剛領取時為 Lv.1（未受訓初階狀態），必須先去國語/數學道館訓練才能打贏野外怪獸！
    if (isStarter) {
      return {
        uid: "pk_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
        id: cat.id,
        id4: cat.id4,
        name: cat.name,
        enName: cat.enName,
        type: cat.type,
        typeEn: cat.typeEn,
        typeColor: cat.typeColor,
        level: 1,
        maxHp: cat.baseHp,
        hp: cat.baseHp,
        atk: cat.baseAtk,
        def: cat.baseDef,
        atkTrained: 0,
        defTrained: 0,
        basicMove: cat.basicMove || "撞擊",
        specialMove: cat.move || "十萬伏特",
        maxAttackPp: 35,
        attackPp: 35,
        maxSpecialPp: cat.specialPp || 25,
        specialPp: cat.specialPp || 25
      };
    }
    // 野生或收服後的寶可夢依等級計算加上玩家目前的道館加成
    const scale = 1 + (lv - cat.minLv) * 0.08;
    const bonusAtk = state ? Math.round((state.atkBonus || 0) * 0.6) : 0;
    const bonusDef = state ? Math.round((state.defBonus || 0) * 0.6) : 0;
    const maxHp = Math.round(cat.baseHp * scale) + bonusDef * 2;
    return {
      uid: "pk_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
      id: cat.id,
      id4: cat.id4,
      name: cat.name,
      enName: cat.enName,
      type: cat.type,
      typeEn: cat.typeEn,
      typeColor: cat.typeColor,
      level: lv,
      maxHp: maxHp,
      hp: maxHp,
      atk: Math.round(cat.baseAtk * scale) + bonusAtk,
      def: Math.round(cat.baseDef * scale) + bonusDef,
      atkTrained: bonusAtk,
      defTrained: bonusDef,
      basicMove: cat.basicMove || "撞擊",
      specialMove: cat.move || "特殊招式",
      maxAttackPp: 35,
      attackPp: 35,
      maxSpecialPp: cat.specialPp || 20,
      specialPp: cat.specialPp || 20
    };
  }

  function getDefaultState() {
    return {
      initialized: false,
      trainerName: "小智",
      regionId: "0,0", // 預設在 柳溪 (Willowbrook)
      x: 16,
      y: 12,
      facing: "south",
      activeIndex: 0,
      party: [],
      storage: [],
      caughtIds: [],
      visitedRegions: ["0,0"],
      collectedChests: [], // 已開啟的寶箱 ID
      coins: 150,          // 初始金幣 ₽150
      items: {
        "poke-ball": 5,
        "great-ball": 1,
        "ultra-ball": 0,
        "potion": 2,
        "super-potion": 0,
        "hyper-potion": 0,
        "revive": 0,
        "ether": 1,
        "repel": 0,
        "power-charm": 0,
        "guard-charm": 0
      },
      ownedBicycle: false,
      ridingBicycle: false,
      repelSteps: 0,
      atkBonus: 0,
      defBonus: 0,
      chineseScore: 0,
      mathScore: 0,
      completedQuestions: [],
      badges: { chinese: false, math: false }
    };
  }

  let state = loadGame();

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.initialized && Array.isArray(parsed.party) && parsed.party.length > 0) {
          return Object.assign(getDefaultState(), parsed);
        }
      }
    } catch (e) {}
    return getDefaultState();
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function getLeadPokemon() {
    if (!state.party || state.party.length === 0) return null;
    if (state.activeIndex >= state.party.length) state.activeIndex = 0;
    return state.party[state.activeIndex];
  }

  function getCurrentRegion() {
    return DATA.regions[state.regionId] || DATA.regions["0,0"];
  }

  // --------------------------------------------------------------------------
  // 4. 初始選擇寶可夢視窗 (皮卡丘、噴火龍、妙蛙種子)
  // --------------------------------------------------------------------------
  function showStarterModal() {
    const modal = document.getElementById("starterModal");
    const grid = document.getElementById("starterChoicesGrid");
    modal.classList.remove("hidden");

    const starters = DATA.starterIds.map((id) => DATA.pokemonCatalog.find((p) => p.id === id));
    grid.innerHTML = starters
      .map((s) => {
        const isSel = s.id === selectedStarterId;
        return `
        <button type="button" class="${isSel ? "selected" : ""}" data-starter-id="${s.id}">
          <img class="creature-art" src="${getAnimSpriteUrl(s.id)}" onerror="this.src='${getStaticSpriteUrl(s.id)}'" alt="${s.name}" />
          <strong>${s.name}</strong>
          <span>${s.type}系 · 絕招：${s.move}</span>
          <small style="font-size:13px;color:#475569;margin-top:2px;">初始 Lv.1 (⚔️ATK ${s.baseAtk} / 🛡️DEF ${s.baseDef})</small>
        </button>
      `;
      })
      .join("");

    grid.querySelectorAll("button[data-starter-id]").forEach((btn) => {
      btn.onclick = () => {
        SFX.playClick();
        selectedStarterId = parseInt(btn.getAttribute("data-starter-id"), 10);
        showStarterModal();
      };
    });
  }

  function confirmStarterSelection() {
    SFX.playHeal();
    const nameInput = document.getElementById("trainerNameInput");
    const nameVal = (nameInput && nameInput.value.trim()) || "小智";
    state.trainerName = nameVal;
    const starter = createPokemonInstance(selectedStarterId, 1, true);
    state.party = [starter];
    state.storage = [];
    state.caughtIds = [starter.id];
    state.initialized = true;
    state.regionId = "0,0";
    state.x = 16;
    state.y = 12;
    saveGame();
    document.getElementById("starterModal").classList.add("hidden");
    updateAllHUD();
    showToast(`🎉 歡迎【${state.trainerName}】與夥伴【${starter.name} Lv.1】！請先前往城鎮左上「國語文道館」與右上「數學道館」訓練提升能力！`);
  }

  // --------------------------------------------------------------------------
  // 5. 2D 像素地圖渲染引擎 (100% 移植 Infinite Pokémon 地形圖塊與物件繪製)
  // --------------------------------------------------------------------------
  const overworldCanvas = document.getElementById("overworldCanvas");
  const ctx = overworldCanvas.getContext("2d");

  // 離屏地圖緩衝區 (512 x 384 = 32x24 格 * 16px)
  const mapBuffer = document.createElement("canvas");
  mapBuffer.width = MAP_COLS * TILE_SIZE;
  mapBuffer.height = MAP_ROWS * TILE_SIZE;
  const mapCtx = mapBuffer.getContext("2d");

  let animTick = 0;
  let camX = 16 * TILE_SIZE;
  let camY = 12 * TILE_SIZE;

  function fillRect(c, color, x, y, w, h) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  function drawProceduralTile(c, tile, px, py, seed = 0, biome = "meadow") {
    fillRect(
      c,
      biome === "forest" ? "#71ad70" : biome === "coast" ? "#a1c785" : biome === "ruins" ? "#94b19b" : "#8dc475",
      px,
      py,
      16,
      16
    );
    const l = (7 * px + 13 * py + seed) % 11;
    if (tile === 0 || tile === 5) {
      fillRect(c, "#9bce7e", px + ((l + 2) % 12), py + 4, 2, 1);
      fillRect(c, "#77b66b", px + 8, py + 11, 2, 1);
      if (tile === 5) {
        fillRect(c, "#5c995a", px + 7, py + 7, 2, 5);
        fillRect(c, "#f5e3a0", px + 5, py + 5, 6, 3);
        fillRect(c, "#f4b674", px + 7, py + 6, 2, 2);
      }
    }
    if (tile === 1 || tile === 7) {
      fillRect(c, "#e4ca90", px, py, 16, 16);
      fillRect(c, "#edd69f", px, py, 16, 2);
      fillRect(c, "#d8bc83", px + (l % 10) + 2, py + 6, 2, 1);
      fillRect(c, "#cdb47b", px + 11, py + 12, 2, 1);
    }
    if (tile === 2) {
      fillRect(c, "#53895b", px + 3, py + 12, 10, 3);
      fillRect(c, "#88694b", px + 6, py + 9, 4, 6);
      fillRect(c, "#35694f", px + 3, py + 3, 10, 9);
      fillRect(c, "#35694f", px + 1, py + 6, 14, 5);
      fillRect(c, "#4b9360", px + 3, py + 1, 10, 8);
      fillRect(c, "#4b9360", px + 1, py + 4, 14, 5);
    }
    if (tile === 3) {
      fillRect(c, "#73af64", px, py, 16, 16);
      for (let i = 0; i < 4; i++) {
        const a = px + 4 * i;
        fillRect(c, "#417b51", a, py + 5, 1, 6);
        fillRect(c, "#53975a", a + 1, py + 3, 1, 6);
        fillRect(c, "#bddb85", a + 2, py + 2, 1, 3);
      }
    }
    if (tile === 4) {
      fillRect(c, "#569aa8", px, py, 16, 16);
      fillRect(c, "#77b7bd", px + 3, py + 4, 7, 1);
      fillRect(c, "#91c8c7", px + 5, py + 5, 3, 1);
    }
    if (tile === 6) fillRect(c, "#c5ba85", px, py, 16, 16);
    if (tile === 8) {
      fillRect(c, "#657f78", px + 2, py + 5, 12, 9);
      fillRect(c, "#a7b8a5", px + 3, py + 3, 10, 9);
      fillRect(c, "#c6ceae", px + 4, py + 4, 7, 2);
    }
  }

  function drawRock(c, px, py) {
    fillRect(c, "#506858", px + 2, py + 11, 12, 4);
    fillRect(c, "#789078", px + 2, py + 5, 12, 8);
    fillRect(c, "#a0b098", px + 4, py + 2, 8, 10);
    fillRect(c, "#c8d0b0", px + 5, py + 3, 5, 3);
  }

  function renderRegionToBuffer(reg) {
    mapCtx.imageSmoothingEnabled = false;
    const terrainImg = IMAGES["terrain"];
    const hasTerrain = terrainImg && terrainImg.complete && terrainImg.naturalWidth > 0;
    const cols = TERRAIN_META.columns;

    const drawTileIdx = (tileIdx, gx, gy) => {
      if (!hasTerrain) return;
      mapCtx.drawImage(
        terrainImg,
        (tileIdx % cols) * 16,
        Math.floor(tileIdx / cols) * 16,
        16,
        16,
        gx * 16,
        gy * 16,
        16,
        16
      );
    };

    const getTile = (gx, gy) => {
      if (gx < 0 || gx >= MAP_COLS || gy < 0 || gy >= MAP_ROWS) return -1;
      return reg.tiles[gy * MAP_COLS + gx];
    };

    const isRoadLike = (gx, gy) => [1, 7, -1].includes(getTile(gx, gy));

    for (let gy = 0; gy < MAP_ROWS; gy++) {
      for (let gx = 0; gx < MAP_COLS; gx++) {
        const t = getTile(gx, gy);
        if (!hasTerrain) {
          drawProceduralTile(mapCtx, t, gx * 16, gy * 16, reg.seed, reg.biome);
          continue;
        }
        drawTileIdx((13 * gx + 7 * gy + reg.seed) % 9 === 0 ? 1 : 17, gx, gy);
        if (t === 1) {
          const n = isRoadLike(gx, gy - 1);
          const s = isRoadLike(gx, gy + 1);
          const w = isRoadLike(gx - 1, gy);
          const e = isRoadLike(gx + 1, gy);
          const idx = n || w ? (n || e ? (s || w ? (s || e ? (n ? (s ? (w ? (e ? 188 : 221) : 219) : 228) : 212) : 229) : 227) : 213) : 211;
          drawTileIdx(idx, gx, gy);
        }
        if (t === 7) {
          drawTileIdx(425, gx, gy);
          drawTileIdx(355, gx, gy);
        }
        if (t === 3) drawTileIdx(10, gx, gy);
        if (t === 4) {
          const isWater = (x, y) => [4, 7].includes(getTile(x, y));
          const n = isWater(gx, gy - 1);
          const s = isWater(gx, gy + 1);
          const w = isWater(gx - 1, gy);
          const e = isWater(gx + 1, gy);
          const idx = n || w ? (n || e ? (s || w ? (s || e ? (n ? (s ? (w ? (e ? 425 : 426) : 424) : 433) : 417) : 434) : 432) : 418) : 416;
          drawTileIdx(idx, gx, gy);
        }
        if (t === 5) drawTileIdx(4, gx, gy);
        if (t === 8) drawRock(mapCtx, gx * 16, gy * 16);
        if (t === 2) drawTileIdx(5, gx, gy);
      }
    }

    // 繪製 2x3 大樹區塊
    if (hasTerrain) {
      const treeBlock = TERRAIN_META.blocks.tree;
      const used = new Set();
      for (let gy = 0; gy < MAP_ROWS - 2; gy++) {
        for (let gx = 0; gx < MAP_COLS - 1; gx++) {
          const canTree = treeBlock.every((row, dy) =>
            row.every((_, dx) => getTile(gx + dx, gy + dy) === 2 && !used.has(`${gx + dx},${gy + dy}`))
          );
          if (canTree) {
            treeBlock.forEach((row, dy) =>
              row.forEach((tIdx, dx) => {
                drawTileIdx(tIdx, gx + dx, gy + dy);
                used.add(`${gx + dx},${gy + dy}`);
              })
            );
          }
        }
      }
    }

    // 繪製建築物、柵欄、告示牌、路標石、寶箱與 NPC
    for (const obj of reg.objects || []) {
      const ox = obj.x * 16;
      const oy = obj.y * 16;
      const ow = obj.width || 1;
      const oh = obj.height || 1;

      if (obj.kind === "building") {
        const block = TERRAIN_META.blocks[obj.sprite || "house"];
        if (hasTerrain && block) {
          block.forEach((row, dy) =>
            row.forEach((tIdx, dx) => drawTileIdx(tIdx, obj.x + dx, obj.y + dy))
          );
        } else {
          fillRect(mapCtx, "#725c4d", ox + 4, oy + 14, ow * 16 - 8, oh * 16 - 14);
          fillRect(mapCtx, "#f0e5bb", ox + 6, oy + 20, ow * 16 - 12, oh * 16 - 22);
          fillRect(mapCtx, "#377b91", ox + 2, oy + 6, ow * 16 - 4, 16);
        }
        continue;
      }

      if (obj.kind === "fence") {
        for (let dy = 0; dy < oh; dy++) {
          for (let dx = 0; dx < ow; dx++) {
            if (hasTerrain) drawTileIdx(644, obj.x + dx, obj.y + dy);
            else fillRect(mapCtx, "#b08d57", (obj.x + dx) * 16 + 2, (obj.y + dy) * 16 + 6, 12, 6);
          }
        }
        continue;
      }

      if (obj.kind === "sign") {
        if (hasTerrain) drawTileIdx(3, obj.x, obj.y);
        else fillRect(mapCtx, "#a16207", ox + 3, oy + 3, 10, 10);
        continue;
      }

      if (obj.kind === "waystone") {
        drawRock(mapCtx, ox, oy);
        fillRect(mapCtx, "#f8e870", ox + 7, oy + 4, 2, 5);
        continue;
      }

      if (obj.kind === "chest") {
        const opened = state.collectedChests.includes(obj.id);
        // 像素金幣寶箱
        fillRect(mapCtx, "rgba(0,0,0,0.3)", ox + 2, oy + 13, 12, 3);
        fillRect(mapCtx, opened ? "#64748b" : "#92400e", ox + 2, oy + 4, 12, 10);
        fillRect(mapCtx, opened ? "#94a3b8" : "#d97706", ox + 3, oy + 3, 10, 5);
        fillRect(mapCtx, "#1e293b", ox + 2, oy + 8, 12, 2);
        fillRect(mapCtx, opened ? "#cbd5e1" : "#fde047", ox + 6, oy + 7, 4, 4);
        continue;
      }

      if (obj.kind === "npc") {
        const npcImg = IMAGES[`people/${obj.sprite || "prof_oak"}`];
        if (npcImg && npcImg.complete && npcImg.naturalWidth > 0) {
          mapCtx.drawImage(npcImg, 0, 0, 16, 32, ox, oy - 16, 16, 32);
        } else {
          fillRect(mapCtx, "#2563eb", ox + 3, oy + 2, 10, 12);
          fillRect(mapCtx, "#fde68a", ox + 4, oy - 6, 8, 8);
        }
      }
    }
  }

  function renderMainLoop() {
    animTick++;
    const reg = getCurrentRegion();
    renderRegionToBuffer(reg);

    // 鏡頭平滑跟隨主角 (視野大小 480x320 = 30x20 格，完整呈現城鎮與周圍道路)
    const viewW = overworldCanvas.width;
    const viewH = overworldCanvas.height;
    const targetCamX = state.x * TILE_SIZE + 8 - viewW / 2;
    const targetCamY = state.y * TILE_SIZE + 8 - viewH / 2;
    const maxCamX = Math.max(0, MAP_COLS * TILE_SIZE - viewW);
    const maxCamY = Math.max(0, MAP_ROWS * TILE_SIZE - viewH);
    const clampedX = Math.max(0, Math.min(maxCamX, targetCamX));
    const clampedY = Math.max(0, Math.min(maxCamY, targetCamY));
    camX += (clampedX - camX) * 0.25;
    camY += (clampedY - camY) * 0.25;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#101820";
    ctx.fillRect(0, 0, viewW, viewH);

    const sx = Math.round(camX);
    const sy = Math.round(camY);
    ctx.drawImage(mapBuffer, -sx, -sy);

    // 繪製建築屋頂中文招牌與寶箱浮動提示
    for (const obj of reg.objects || []) {
      if (obj.kind === "building" && obj.badge) {
        const bx = (obj.x + (obj.width || 5) / 2) * TILE_SIZE - sx;
        const by = obj.y * TILE_SIZE - sy - 4;
        ctx.save();
        ctx.font = "900 11px 'Noto Sans TC', sans-serif";
        const tw = ctx.measureText(obj.badge).width + 12;
        ctx.fillStyle = obj.badgeColor || "#1e293b";
        ctx.fillRect(bx - tw / 2, by - 14, tw, 16);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - tw / 2, by - 14, tw, 16);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(obj.badge, bx, by - 2);
        ctx.restore();
      } else if (obj.kind === "chest" && !state.collectedChests.includes(obj.id)) {
        const cx = obj.x * TILE_SIZE + 8 - sx;
        const cy = obj.y * TILE_SIZE - 4 - sy + Math.sin(animTick * 0.12) * 2;
        ctx.save();
        ctx.font = "900 10px 'Noto Sans TC', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fef08a";
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 2.5;
        ctx.strokeText("🪙寶箱", cx, cy);
        ctx.fillText("🪙寶箱", cx, cy);
        ctx.restore();
      } else if (obj.kind === "npc" && obj.name) {
        const nx = obj.x * TILE_SIZE + 8 - sx;
        const ny = obj.y * TILE_SIZE - 18 - sy;
        ctx.save();
        ctx.font = "800 9px 'Noto Sans TC', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        const shortName = obj.name.split(" ")[0];
        ctx.strokeText(shortName, nx, ny);
        ctx.fillText(shortName, nx, ny);
        ctx.restore();
      }
    }

    // 繪製四方出口路標提示
    drawExitIndicators(ctx, reg, sx, sy);

    // 繪製主角訓練家 (使用新生成的 assets/trainer.png)
    drawPlayerTrainer(ctx, state.x * TILE_SIZE + 8 - sx, state.y * TILE_SIZE + 12 - sy);

    requestAnimationFrame(renderMainLoop);
  }

  function drawExitIndicators(c, reg, sx, sy) {
    if (!reg.exits) return;
    c.save();
    c.font = "900 10px 'Noto Sans TC', sans-serif";
    c.textAlign = "center";
    if (reg.exits.north) {
      const x = 16 * TILE_SIZE + 8 - sx;
      const y = 14 - sy;
      drawPillText(c, `⬆️ 北：${reg.exits.north.name}`, x, y, "#1e3a8a");
    }
    if (reg.exits.south) {
      const x = 16 * TILE_SIZE + 8 - sx;
      const y = 23 * TILE_SIZE + 12 - sy;
      drawPillText(c, `⬇️ 南：${reg.exits.south.name}`, x, y, "#1e3a8a");
    }
    if (reg.exits.west) {
      const x = 58 - sx;
      const y = 12 * TILE_SIZE - sy;
      drawPillText(c, `⬅️ 西：${reg.exits.west.name}`, x, y, "#581c87");
    }
    if (reg.exits.east) {
      const x = 31 * TILE_SIZE - 42 - sx;
      const y = 12 * TILE_SIZE - sy;
      drawPillText(c, `➡️ 東：${reg.exits.east.name}`, x, y, "#0f766e");
    }
    c.restore();
  }

  function drawPillText(c, text, x, y, bg) {
    const w = c.measureText(text).width + 10;
    c.fillStyle = bg;
    c.fillRect(x - w / 2, y - 10, w, 14);
    c.strokeStyle = "#fde047";
    c.lineWidth = 1;
    c.strokeRect(x - w / 2, y - 10, w, 14);
    c.fillStyle = "#ffffff";
    c.fillText(text, x, y);
  }

  function drawPlayerTrainer(c, px, py) {
    const bounce = Math.abs(Math.sin(animTick * 0.12)) * 1.5;
    c.save();
    // 陰影
    c.fillStyle = "rgba(0,0,0,0.38)";
    c.beginPath();
    c.ellipse(px, py + 2, 7, 3.5, 0, 0, Math.PI * 2);
    c.fill();

    // 若騎乘腳踏車，繪製腳踏車輪框
    if (state.ridingBicycle) {
      c.strokeStyle = "#10b981";
      c.lineWidth = 2;
      c.strokeRect(px - 9, py - 5, 18, 6);
    }

    const tImg = IMAGES["trainer"];
    if (tImg && tImg.complete && tImg.naturalWidth > 0) {
      const h = 28;
      const w = h * (tImg.naturalWidth / tImg.naturalHeight);
      c.save();
      if (state.facing === "west") {
        c.translate(px, py);
        c.scale(-1, 1);
        c.drawImage(tImg, -w / 2, -h + 3 - bounce, w, h);
      } else {
        c.drawImage(tImg, px - w / 2, py - h + 3 - bounce, w, h);
      }
      c.restore();
    } else {
      fillRect(c, "#dc2626", px - 6, py - 18 - bounce, 12, 18);
    }
    c.restore();
  }

  // --------------------------------------------------------------------------
  // 6. 角色移動、地圖切換、碰撞與互動系統 (Move & Interact)
  // --------------------------------------------------------------------------
  const DIR_DELTAS = {
    north: [0, -1],
    south: [0, 1],
    west: [-1, 0],
    east: [1, 0]
  };

  function isAnyModalOpen() {
    return (
      !document.getElementById("starterModal").classList.contains("hidden") ||
      !document.getElementById("menuModal").classList.contains("hidden") ||
      !document.getElementById("chineseGymModal").classList.contains("hidden") ||
      !document.getElementById("mathGymModal").classList.contains("hidden") ||
      !document.getElementById("gbaBattle").classList.contains("hidden")
    );
  }

  function isSolidTile(reg, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return true;
    const t = reg.tiles[ty * MAP_COLS + tx];
    if ([2, 4, 6, 8].includes(t)) {
      // 允許站在建築大門格上
      const isDoor = (reg.objects || []).some((o) => o.kind === "door" && o.x === tx && o.y === ty);
      if (isDoor) return false;
      return true;
    }
    for (const obj of reg.objects || []) {
      if (!obj.solid) continue;
      if (obj.kind === "chest" && state.collectedChests.includes(obj.id)) continue;
      const ow = obj.width || 1;
      const oh = obj.height || 1;
      if (tx >= obj.x && tx < obj.x + ow && ty >= obj.y && ty < obj.y + oh) {
        return true;
      }
    }
    return false;
  }

  function getFacingObject() {
    const reg = getCurrentRegion();
    const [dx, dy] = DIR_DELTAS[state.facing] || [0, 1];
    const fx = state.x + dx;
    const fy = state.y + dy;

    // 先檢查面對的格子或腳下的門
    for (const obj of reg.objects || []) {
      if (obj.kind === "chest" && state.collectedChests.includes(obj.id)) continue;
      const ow = obj.width || 1;
      const oh = obj.height || 1;
      if (
        (fx >= obj.x && fx < obj.x + ow && fy >= obj.y && fy < obj.y + oh) ||
        (obj.kind === "door" && state.x === obj.x && state.y === obj.y)
      ) {
        return obj;
      }
      // 若面對建築物的正門底邊，自動對應到該建築的門
      if (obj.kind === "building" && fx >= obj.x && fx < obj.x + ow && fy === obj.y + oh - 1) {
        const doorObj = (reg.objects || []).find(
          (d) => d.kind === "door" && d.x >= obj.x && d.x < obj.x + ow && d.y === obj.y + oh - 1
        );
        if (doorObj) return doorObj;
      }
    }
    return null;
  }

  function movePlayer(dir) {
    if (isAnyModalOpen()) return;
    state.facing = dir;
    const [dx, dy] = DIR_DELTAS[dir] || [0, 0];
    const nx = state.x + dx;
    const ny = state.y + dy;
    const reg = getCurrentRegion();

    // 檢查是否走出地圖邊界（切換至相鄰的 5 大地圖）
    if (nx < 0 && reg.exits && reg.exits.west) {
      travelToRegion(reg.exits.west.target, reg.exits.west.x, reg.exits.west.y);
      return;
    }
    if (nx >= MAP_COLS && reg.exits && reg.exits.east) {
      travelToRegion(reg.exits.east.target, reg.exits.east.x, reg.exits.east.y);
      return;
    }
    if (ny < 0 && reg.exits && reg.exits.north) {
      travelToRegion(reg.exits.north.target, reg.exits.north.x, reg.exits.north.y);
      return;
    }
    if (ny >= MAP_ROWS && reg.exits && reg.exits.south) {
      travelToRegion(reg.exits.south.target, reg.exits.south.x, reg.exits.south.y);
      return;
    }

    // 檢查是否踏入建築大門
    const doorObj = (reg.objects || []).find((o) => o.kind === "door" && o.x === nx && o.y === ny);
    if (doorObj) {
      state.x = nx;
      state.y = ny;
      triggerObjectInteraction(doorObj);
      updateContextBar();
      return;
    }

    if (isSolidTile(reg, nx, ny)) {
      updateContextBar();
      return;
    }

    state.x = nx;
    state.y = ny;
    SFX.playStep();

    if (state.repelSteps > 0) {
      state.repelSteps--;
    }

    // 檢查是否踏入深草叢 (tile === 3) 觸發野生寶可夢遭遇戰
    const steppedTile = reg.tiles[ny * MAP_COLS + nx];
    if (steppedTile === 3 && state.repelSteps <= 0) {
      if (Math.random() < 0.24) {
        startWildEncounter(reg.id);
      }
    }

    saveGame();
    updateContextBar();
  }

  function travelToRegion(targetRegionId, spawnX = null, spawnY = null) {
    const nextReg = DATA.regions[targetRegionId];
    if (!nextReg) return;
    SFX.playClick();
    state.regionId = targetRegionId;
    state.x = spawnX !== null ? spawnX : nextReg.spawn.x;
    state.y = spawnY !== null ? spawnY : nextReg.spawn.y;
    if (!state.visitedRegions.includes(targetRegionId)) {
      state.visitedRegions.push(targetRegionId);
    }
    camX = state.x * TILE_SIZE;
    camY = state.y * TILE_SIZE;
    saveGame();
    updateAllHUD();

    const lead = getLeadPokemon();
    if (lead && (lead.atk < nextReg.recAtk || lead.def < nextReg.recDef)) {
      showToast(
        `⚠️ 進入【${nextReg.name}】（${nextReg.tierLabel}）！注意：本區建議戰力為 ⚔️ATK ${nextReg.recAtk}+ / 🛡️DEF ${nextReg.recDef}+，目前你的寶可夢可能打不贏這裡的怪獸，建議先回柳溪道館訓練！`
      );
    } else {
      showToast(`🗺️ 抵達【${nextReg.name}】— ${nextReg.tierLabel}`);
    }
  }

  function triggerObjectInteraction(obj) {
    if (!obj) obj = getFacingObject();
    if (!obj) {
      showToast("💡 請走到道館大門、寶可夢商店、寶箱或 NPC 旁再按 E 互動！");
      return;
    }

    if (obj.kind === "door") {
      if (obj.action === "chinese-gym") {
        openChineseGym("a");
      } else if (obj.action === "math-gym") {
        openMathGym("a");
      } else if (obj.action === "poke-shop") {
        healAllParty(false);
        openMenuModal("shop");
        showToast("💖 喬伊小姐已免費為你的寶可夢全隊恢復滿 HP 與 PP！歡迎選購商店特殊道具！");
      } else if (obj.action === "heal-station") {
        healAllParty(true);
      }
      return;
    }

    if (obj.kind === "chest") {
      if (state.collectedChests.includes(obj.id)) {
        showToast("這個寶箱已經打開過囉！");
        return;
      }
      SFX.playChest();
      state.collectedChests.push(obj.id);
      const coinGain = obj.coins || 120;
      state.coins = (state.coins || 0) + coinGain;
      if (obj.bonusItem) {
        state.items[obj.bonusItem] = (state.items[obj.bonusItem] || 0) + (obj.bonusCount || 1);
      }
      saveGame();
      updateAllHUD();
      openDialogueModal(
        `🎁 發現寶箱：${obj.name}`,
        obj.text || `獲得金幣 ₽${coinGain}！快去柳溪的「🏪寶可夢商店」購買精靈球與特殊道具吧！`
      );
      return;
    }

    if (obj.kind === "npc") {
      SFX.playClick();
      if (obj.role === "chinese-gym") {
        openDialogueModal(obj.name, obj.text, [
          { label: "📕 立即進入國語文道館特訓 (+攻擊力)", onClick: () => openChineseGym("a") }
        ]);
      } else if (obj.role === "math-gym") {
        openDialogueModal(obj.name, obj.text, [
          { label: "📘 立即進入數學道館特訓 (+防禦力)", onClick: () => openMathGym("a") }
        ]);
      } else if (obj.role === "poke-shop") {
        healAllParty(false);
        openDialogueModal(obj.name, obj.text, [
          { label: "🏪 開啟寶可夢商店購買道具", onClick: () => openMenuModal("shop") }
        ]);
      } else {
        openDialogueModal(obj.name, obj.text);
      }
      return;
    }

    if (obj.kind === "sign" || obj.kind === "waystone" || obj.kind === "fence") {
      SFX.playClick();
      openDialogueModal(obj.name || "路標告示", obj.text || getCurrentRegion().description);
    }
  }

  function openDialogueModal(title, text, extraButtons = []) {
    const modal = document.getElementById("menuModal");
    const titleEl = document.getElementById("menuModalTitle");
    const bodyEl = document.getElementById("menuModalBody");
    titleEl.textContent = title;
    bodyEl.innerHTML = `
      <p class="dialogue-text" style="font-size:20px;line-height:1.5;color:#1e293b;margin-bottom:16px;">${text}</p>
      <div class="button-row" id="dialogueExtraBtns" style="justify-content:flex-end;"></div>
    `;
    const btnRow = document.getElementById("dialogueExtraBtns");
    extraButtons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "button primary";
      btn.textContent = b.label;
      btn.onclick = () => {
        modal.classList.add("hidden");
        b.onClick();
      };
      btnRow.appendChild(btn);
    });
    const closeBtn = document.createElement("button");
    closeBtn.className = "button";
    closeBtn.innerHTML = `繼續冒險 <kbd>E / Space</kbd>`;
    closeBtn.onclick = () => modal.classList.add("hidden");
    btnRow.appendChild(closeBtn);
    modal.classList.remove("hidden");
  }

  function healAllParty(showMsg = true) {
    SFX.playHeal();
    state.party.forEach((p) => {
      p.hp = p.maxHp;
      p.attackPp = p.maxAttackPp || 35;
      p.specialPp = p.maxSpecialPp || 25;
    });
    saveGame();
    updateAllHUD();
    if (showMsg) {
      showToast("💖 全隊寶可夢已恢復滿 HP 與招式 PP！");
    }
  }

  // --------------------------------------------------------------------------
  // 7. GBA 經典回合制對戰與約 60% 機率收服系統 (.gba-battle)
  // --------------------------------------------------------------------------
  let currentBattle = null;

  function startWildEncounter(regionId) {
    const lead = getLeadPokemon();
    if (!lead) return;
    const reg = DATA.regions[regionId] || getCurrentRegion();
    const pool = DATA.pokemonCatalog.filter((p) => p.regionId === regionId);
    const chosenCat =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : DATA.pokemonCatalog.find((p) => p.regionId === "0,0");

    const [minLv, maxLv] = reg.levelRange || [3, 5];
    const enemyLv = minLv + Math.floor(Math.random() * (maxLv - minLv + 1));
    const scale = 1 + (enemyLv - chosenCat.minLv) * 0.1;

    const enemy = {
      id: chosenCat.id,
      id4: chosenCat.id4,
      name: chosenCat.name,
      type: chosenCat.type,
      level: enemyLv,
      maxHp: Math.round(chosenCat.baseHp * scale),
      hp: Math.round(chosenCat.baseHp * scale),
      atk: Math.round(chosenCat.baseAtk * scale),
      def: Math.round(chosenCat.baseDef * scale),
      move: chosenCat.move || "撞擊",
      defeated: false
    };

    currentBattle = {
      regionId,
      regionName: reg.name,
      enemy,
      busy: false
    };

    // 播放閃光遭遇過場
    const transEl = document.getElementById("encounterTransition");
    transEl.style.display = "block";
    SFX.playAttack();
    setTimeout(() => {
      transEl.style.display = "none";
    }, 450);

    document.getElementById("gbaBattle").classList.remove("hidden");
    document.getElementById("battleSubMenu").style.display = "none";
    document.getElementById("battleMainCommands").style.display = "grid";

    renderBattleHUD();

    const untrainedWarning =
      lead.level <= 1 || (lead.atk < reg.recAtk && lead.def < reg.recDef)
        ? `\n⚠️ 警告：你的【${lead.name} Lv.${lead.level}】(⚔️${lead.atk}/🛡️${lead.def}) 尚未完成足夠的道館訓練，難以戰勝 Lv.${enemy.level} 的對手！`
        : "";

    setBattleMessage(
      `🌿 在【${reg.name}】遇到了野生的【${enemy.name} Lv.${enemy.level}】！${untrainedWarning}`
    );
  }

  function renderBattleHUD() {
    if (!currentBattle) return;
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;

    document.getElementById("battleEnemyName").textContent = enemy.name;
    document.getElementById("battleEnemyLv").textContent = `Lv.${enemy.level}`;
    document.getElementById("battleEnemyStats").textContent = `⚔️ATK ${enemy.atk} · 🛡️DEF ${enemy.def} · ${enemy.type}系`;
    const ePct = Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
    const eBar = document.getElementById("battleEnemyHpBar");
    eBar.style.width = `${ePct}%`;
    eBar.style.background = ePct < 25 ? "#e05848" : ePct < 50 ? "#e8c840" : "#58b888";
    document.getElementById("battleEnemyHpTxt").textContent = `${enemy.hp} / ${enemy.maxHp}`;

    const eImg = document.getElementById("battleEnemySprite");
    eImg.src = getAnimSpriteUrl(enemy.id, false);
    eImg.onerror = () => {
      eImg.src = getStaticSpriteUrl(enemy.id, false);
    };
    eImg.style.opacity = enemy.defeated ? "0.6" : "1";

    document.getElementById("battlePlayerName").textContent = lead.name;
    document.getElementById("battlePlayerLv").textContent = `Lv.${lead.level}`;
    document.getElementById("battlePlayerStats").textContent = `⚔️ATK ${lead.atk} · 🛡️DEF ${lead.def} · ${lead.type}系`;
    const pPct = Math.max(0, Math.min(100, (lead.hp / lead.maxHp) * 100));
    const pBar = document.getElementById("battlePlayerHpBar");
    pBar.style.width = `${pPct}%`;
    pBar.style.background = pPct < 25 ? "#e05848" : pPct < 50 ? "#e8c840" : "#58b888";
    document.getElementById("battlePlayerHpTxt").textContent = `${lead.hp} / ${lead.maxHp}`;

    const pImg = document.getElementById("battlePlayerSprite");
    pImg.src = getAnimSpriteUrl(lead.id, true);
    pImg.onerror = () => {
      pImg.src = getStaticSpriteUrl(lead.id, true);
    };
  }

  function setBattleMessage(msg) {
    const el = document.getElementById("battleMessage");
    if (el) el.textContent = msg;
  }

  function showBattleSubMenu(type) {
    if (!currentBattle || currentBattle.busy) return;
    SFX.playClick();
    const mainCmds = document.getElementById("battleMainCommands");
    const subMenu = document.getElementById("battleSubMenu");
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;

    if (type === "main") {
      subMenu.style.display = "none";
      mainCmds.style.display = "grid";
      return;
    }

    mainCmds.style.display = "none";
    subMenu.style.display = "grid";

    if (type === "fight") {
      if (enemy.defeated) {
        setBattleMessage(`🎯 【${enemy.name}】已經被擊敗（HP 0）！請點選「BAG 背包/投球」丟出精靈球嘗試收服（約 60% 機率）！`);
        showBattleSubMenu("bag");
        return;
      }
      subMenu.innerHTML = `
        <button data-move="basic">${lead.basicMove} <small>(PP ${lead.attackPp}/${lead.maxAttackPp})</small></button>
        <button data-move="special">${lead.specialMove} <small>(PP ${lead.specialPp}/${lead.maxSpecialPp})</small></button>
        <button data-move="gym-boost" style="color:#1d4ed8;">💡 道館知識蓄力 (+攻防)</button>
        <button data-move="cancel" style="color:#64748b;">↩ 返回 (CANCEL)</button>
      `;
      subMenu.querySelectorAll("button[data-move]").forEach((btn) => {
        btn.onclick = () => {
          const mv = btn.getAttribute("data-move");
          if (mv === "cancel") showBattleSubMenu("main");
          else executePlayerMove(mv);
        };
      });
    } else if (type === "bag") {
      const usableIds = ["poke-ball", "great-ball", "ultra-ball", "potion", "super-potion", "hyper-potion", "ether"];
      const buttonsHtml = usableIds
        .filter((id) => (state.items[id] || 0) > 0)
        .map((id) => {
          const item = DATA.shopItems.find((it) => it.id === id);
          return `<button data-item="${id}">${item.name.split(" ")[0]} ×${state.items[id]}</button>`;
        })
        .join("");
      subMenu.innerHTML = `
        ${buttonsHtml || `<div style="grid-column:1/-1;font-size:15px;color:#64748b;padding:4px;">背包中沒有可用精靈球或傷藥！可去柳溪寶可夢商店購買。</div>`}
        <button data-item="cancel" style="color:#64748b;">↩ 返回 (CANCEL)</button>
      `;
      subMenu.querySelectorAll("button[data-item]").forEach((btn) => {
        btn.onclick = () => {
          const itemId = btn.getAttribute("data-item");
          if (itemId === "cancel") showBattleSubMenu("main");
          else useBattleItem(itemId);
        };
      });
    } else if (type === "party") {
      subMenu.innerHTML =
        state.party
          .map(
            (p, idx) => `
          <button data-switch="${idx}" ${idx === state.activeIndex || p.hp <= 0 ? "disabled" : ""}>
            ${p.name} Lv.${p.level} (${p.hp}/${p.maxHp})
          </button>
        `
          )
          .join("") + `<button data-switch="cancel" style="color:#64748b;">↩ 返回</button>`;
      subMenu.querySelectorAll("button[data-switch]").forEach((btn) => {
        btn.onclick = () => {
          const v = btn.getAttribute("data-switch");
          if (v === "cancel") {
            showBattleSubMenu("main");
          } else {
            state.activeIndex = parseInt(v, 10);
            SFX.playClick();
            showBattleSubMenu("main");
            renderBattleHUD();
            updateAllHUD();
            setBattleMessage(`🔄 換上了【${getLeadPokemon().name} Lv.${getLeadPokemon().level}】！`);
          }
        };
      });
    }
  }

  function executePlayerMove(moveKind) {
    if (!currentBattle || currentBattle.busy) return;
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;

    showBattleSubMenu("main");
    currentBattle.busy = true;

    if (moveKind === "gym-boost") {
      SFX.playHeal();
      const healAmt = Math.max(6, Math.round(lead.maxHp * 0.2));
      lead.hp = Math.min(lead.maxHp, lead.hp + healAmt);
      renderBattleHUD();
      setBattleMessage(`✨ 【${lead.name}】回想國語文道館與數學道館所學，恢復了 ${healAmt} 點 HP！`);
      setTimeout(() => enemyTurnAttack(), 1000);
      return;
    }

    const isSpecial = moveKind === "special";
    if (isSpecial && lead.specialPp <= 0) {
      currentBattle.busy = false;
      setBattleMessage(`⚠️ 【${lead.specialMove}】的 PP 已經用完了！請使用普通招式或以太回復。`);
      return;
    }
    if (isSpecial) lead.specialPp = Math.max(0, lead.specialPp - 1);
    else lead.attackPp = Math.max(0, lead.attackPp - 1);

    const moveName = isSpecial ? lead.specialMove : lead.basicMove;
    const mult = isSpecial ? 1.35 : 1.0;

    // 重要：若主角尚未去國語道館訓練（ATK 遠低於野生怪獸 DEF），只能造成 1~2 點微弱傷害！
    const rawDmg = lead.atk * mult - enemy.def * 0.72;
    const dmg = rawDmg <= 1 ? Math.max(1, Math.floor(Math.random() * 2) + 1) : Math.max(3, Math.round(rawDmg + Math.random() * 4));

    const pWrap = document.getElementById("battlePlayerSpriteWrap");
    const eWrap = document.getElementById("battleEnemySpriteWrap");
    pWrap.classList.add("lunge-player");
    SFX.playAttack();
    setTimeout(() => {
      pWrap.classList.remove("lunge-player");
      eWrap.classList.add("hit");
      setTimeout(() => eWrap.classList.remove("hit"), 420);
    }, 180);

    enemy.hp = Math.max(0, enemy.hp - dmg);
    renderBattleHUD();

    if (enemy.hp <= 0) {
      enemy.defeated = true;
      currentBattle.busy = false;
      SFX.playCorrect();
      const coinDrop = enemy.level * 8;
      state.coins = (state.coins || 0) + coinDrop;
      saveGame();
      updateAllHUD();
      renderBattleHUD();
      setBattleMessage(
        `🎉 【${lead.name}】使出「${moveName}」造成 ${dmg} 點傷害，成功擊敗了【${enemy.name}】（獲得戰鬥金幣 ₽${coinDrop}）！\n👉 現在請點選「BAG 背包/投球」丟出精靈球嘗試收服（收服機率約 60%）！`
      );
      return;
    }

    const weakHint =
      dmg <= 2
        ? `\n（💡 傷害太低了！你的寶可夢還沒去「📕國語文道館」訓練提升攻擊力！）`
        : "";
    setBattleMessage(`⚡ 【${lead.name}】使出「${moveName}」，對【${enemy.name}】造成了 ${dmg} 點傷害！${weakHint}`);

    setTimeout(() => {
      enemyTurnAttack();
    }, 1050);
  }

  function enemyTurnAttack() {
    if (!currentBattle) return;
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;
    if (enemy.defeated) {
      currentBattle.busy = false;
      return;
    }

    const eWrap = document.getElementById("battleEnemySpriteWrap");
    const pWrap = document.getElementById("battlePlayerSpriteWrap");
    eWrap.classList.add("lunge-enemy");
    SFX.playAttack();
    setTimeout(() => {
      eWrap.classList.remove("lunge-enemy");
      pWrap.classList.add("hit");
      setTimeout(() => pWrap.classList.remove("hit"), 420);
    }, 180);

    // 若主角尚未去數學道館訓練（DEF 遠低於野生怪獸 ATK），會受到重創！
    const rawEnemyDmg = enemy.atk * 1.1 - lead.def * 0.68;
    const eDmg = Math.max(2, Math.round(rawEnemyDmg + Math.random() * 3));
    lead.hp = Math.max(0, lead.hp - eDmg);
    renderBattleHUD();
    updateAllHUD();

    if (lead.hp <= 0) {
      SFX.playWrong();
      setBattleMessage(
        `💥 【${enemy.name} Lv.${enemy.level}】使出「${enemy.move}」造成 ${eDmg} 點傷害！【${lead.name}】體力不支倒下了！\n🏥 你被送回柳溪醫療所恢復體力。請先去「📕國語文道館」與「📘數學道館」訓練變強後再來挑戰！`
      );
      setTimeout(() => {
        closeBattle();
        state.regionId = "0,0";
        state.x = 16;
        state.y = 12;
        healAllParty(false);
        openDialogueModal(
          "💡 木木博士的提醒：請先到兩大道館訓練！",
          `你的【${lead.name}】（Lv.${lead.level} · ⚔️ATK ${lead.atk} · 🛡️DEF ${lead.def}）目前能力還太初階，打不贏野外的【${enemy.name} Lv.${enemy.level}】！\n\n請先在柳溪城鎮進入：\n1. 「📕 國語文道館」提升寶可夢的【攻擊力 ⚔️ATK】\n2. 「📘 數學道館」提升寶可夢的【防禦力 🛡️DEF 與 HP】\n能力提升後，就能輕鬆打敗並收服各個地圖的寶可夢囉！`,
          [
            { label: "📕 前往國語文道館 (+ATK)", onClick: () => openChineseGym("a") },
            { label: "📘 前往數學道館 (+DEF)", onClick: () => openMathGym("a") }
          ]
        );
      }, 2200);
      return;
    }

    currentBattle.busy = false;
    setBattleMessage(
      `💢 野生的【${enemy.name}】使出「${enemy.move}」，對【${lead.name}】造成 ${eDmg} 點傷害！請選擇下一回合行動！`
    );
  }

  function useBattleItem(itemId) {
    if (!currentBattle || currentBattle.busy) return;
    const item = DATA.shopItems.find((it) => it.id === itemId);
    if (!item || (state.items[itemId] || 0) <= 0) return;

    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;
    showBattleSubMenu("main");

    if (item.effect === "capture") {
      // 重要規則：必須先打敗對手（或將對手削弱至極低血量）才能成功收服；即使打敗對手，收服基礎機率設定在約六成（62%）！
      if (!enemy.defeated && enemy.hp > enemy.maxHp * 0.35) {
        SFX.playWrong();
        setBattleMessage(
          `⚠️ 【${enemy.name}】現在還精力充沛（HP ${enemy.hp}/${enemy.maxHp}），直接丟球會被彈開！請先用「FIGHT 戰鬥」打敗或削弱牠再投球！`
        );
        return;
      }

      state.items[itemId]--;
      currentBattle.busy = true;
      saveGame();
      updateAllHUD();

      const ballEl = document.getElementById("battleThrownBall");
      ballEl.style.display = "block";
      SFX.playBallThrow();
      setBattleMessage(`🔴 你丟出了【${item.name}】！（基礎收服成功率約 ${Math.round(item.power * 100)}%）……咕嚕……咕嚕……`);

      setTimeout(() => {
        ballEl.style.display = "none";
        // 打敗後基礎收服率：精靈球 62% (~六成)、超級球 76%、高級球 88%
        const rate = enemy.defeated ? item.power : item.power * 0.65;
        const success = Math.random() < rate;

        if (success) {
          SFX.playCaptureSuccess();
          const newPoke = createPokemonInstance(enemy.id, enemy.level, false);
          if (state.party.length < 6) {
            state.party.push(newPoke);
          } else {
            state.storage.push(newPoke);
          }
          if (!state.caughtIds.includes(enemy.id)) {
            state.caughtIds.push(enemy.id);
          }
          saveGame();
          updateAllHUD();
          setBattleMessage(
            `✨ 喀嚓！太棒了！你成功收服了【${enemy.name} Lv.${enemy.level}】！\n（已加入你的${state.party.length <= 6 ? "出戰隊伍" : "寶可夢倉庫"}與圖鑑！）`
          );
          showToast(`🎉 成功收服【${enemy.name} Lv.${enemy.level}】！`);
          setTimeout(() => {
            closeBattle();
          }, 1900);
        } else {
          SFX.playWrong();
          currentBattle.busy = false;
          if (enemy.defeated) {
            setBattleMessage(
              `💨 哎呀！差一點點！【${enemy.name}】從球裡掙脫了！（即使打敗對手，收服機率約為六成，還沒有逃走，可再從 BAG 丟一顆球試試！）`
            );
          } else {
            setBattleMessage(`💨 【${enemy.name}】掙脫了精靈球！先把牠的 HP 打到 0 再投球成功率更高喔！`);
            setTimeout(() => enemyTurnAttack(), 1000);
          }
        }
      }, 1500);
      return;
    }

    if (item.effect === "heal") {
      state.items[itemId]--;
      SFX.playHeal();
      lead.hp = Math.min(lead.maxHp, lead.hp + item.power);
      saveGame();
      renderBattleHUD();
      updateAllHUD();
      setBattleMessage(`💖 使用了【${item.name}】，【${lead.name}】恢復了 ${item.power} 點 HP！`);
      currentBattle.busy = true;
      setTimeout(() => enemyTurnAttack(), 1000);
      return;
    }

    if (item.effect === "pp") {
      state.items[itemId]--;
      SFX.playHeal();
      lead.attackPp = Math.min(lead.maxAttackPp, lead.attackPp + 10);
      lead.specialPp = Math.min(lead.maxSpecialPp, lead.specialPp + 10);
      saveGame();
      updateAllHUD();
      setBattleMessage(`🧪 使用了【${item.name}】，招式 PP 恢復了 10 點！`);
    }
  }

  function closeBattle() {
    currentBattle = null;
    document.getElementById("gbaBattle").classList.add("hidden");
    updateAllHUD();
  }

  // --------------------------------------------------------------------------
  // 8. START 選單與通用視窗 (POKÉMON 隊伍 / BAG 背包 / SHOP 商店 / TOWN MAP / CODEX / TRAINER)
  // --------------------------------------------------------------------------
  function openMenuModal(tab) {
    SFX.playClick();
    document.getElementById("startMenu").style.display = "none";
    const modal = document.getElementById("menuModal");
    const box = document.getElementById("menuModalBox");
    const titleEl = document.getElementById("menuModalTitle");
    const bodyEl = document.getElementById("menuModalBody");

    box.classList.toggle("wide", ["map", "shop", "codex"].includes(tab));
    modal.classList.remove("hidden");

    const titles = {
      party: "YOUR POKÉMON · 寶可夢隊伍與倉庫",
      bag: "YOUR BAG · 背包道具與補給",
      shop: "POKÉMON SHOP · 柳溪寶可夢商店（金幣購買特殊道具）",
      map: "TOWN MAP · 五大區域地圖與等級劃分",
      codex: "COMPANION CODEX · 寶可夢收服圖鑑",
      trainer: "TRAINER CARD · 訓練家狀態名片"
    };
    titleEl.textContent = titles[tab] || "MENU";

    if (tab === "party") {
      const partyCards = state.party
        .map((p, idx) => {
          const isLeader = idx === state.activeIndex;
          const pct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
          return `
          <button type="button" class="companion-card ${isLeader ? "active" : ""}" data-party-idx="${idx}">
            <img src="${getPortraitUrl(p.id4)}" onerror="this.src='${getStaticSpriteUrl(p.id)}'" alt="${p.name}" />
            <div>
              <strong>${p.name} <span style="font-size:15px;color:#1e40af;">Lv.${p.level} ${isLeader ? "· ★ 出戰隊長 (LEADER)" : ""}</span></strong>
              <span style="font-size:15px;color:#334155;font-weight:800;">
                ${p.type}系 · ⚔️攻擊力 ${p.atk} · 🛡️防禦力 ${p.def} · 絕招：${p.specialMove}
              </span>
              <div class="health" style="margin-top:6px;">
                <span>HP</span>
                <div><i style="width:${pct}%;background:${pct < 25 ? "#df7666" : pct < 50 ? "#e4be5e" : "#58b888"};"></i></div>
                <small>${p.hp} / ${p.maxHp}</small>
              </div>
            </div>
            <span class="pokeball small"><i></i></span>
          </button>
        `;
        })
        .join("");

      const storageRows = state.storage
        .map(
          (p, sIdx) => `
          <div class="catalog-row">
            <img src="${getPortraitUrl(p.id4)}" onerror="this.src='${getStaticSpriteUrl(p.id)}'" style="width:48px;height:48px;image-rendering:pixelated;" />
            <div>
              <strong>${p.name} · Lv.${p.level}</strong>
              <p>⚔️ATK ${p.atk} · 🛡️DEF ${p.def} · HP ${p.hp}/${p.maxHp}</p>
            </div>
            <button type="button" class="button" data-swap-storage="${sIdx}">與隊長交換</button>
          </div>
        `
        )
        .join("");

      bodyEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <span>目前隨身隊伍：<strong>${state.party.length} / 6 隻</strong>（點擊卡片可切換出戰隊長）</span>
          <button type="button" class="button primary" id="btnPartyHealAll">💖 免費全隊恢復滿血</button>
        </div>
        <div class="party-list">${partyCards}</div>
        <p style="margin:14px 0 6px;font-weight:800;color:#475569;">📦 電腦倉庫中的寶可夢（${state.storage.length} 隻）：</p>
        <div class="catalog-list">${storageRows || `<div style="color:#64748b;font-size:15px;">倉庫目前是空的（當隊伍滿 6 隻時，新收服的寶可夢會存放在這裡）。</div>`}</div>
      `;

      bodyEl.querySelectorAll("button[data-party-idx]").forEach((btn) => {
        btn.onclick = () => {
          state.activeIndex = parseInt(btn.getAttribute("data-party-idx"), 10);
          SFX.playClick();
          saveGame();
          updateAllHUD();
          openMenuModal("party");
          showToast(`⚡ 已將【${getLeadPokemon().name}】設為出戰隊長！`);
        };
      });
      bodyEl.querySelectorAll("button[data-swap-storage]").forEach((btn) => {
        btn.onclick = () => {
          const sIdx = parseInt(btn.getAttribute("data-swap-storage"), 10);
          const temp = state.party[state.activeIndex];
          state.party[state.activeIndex] = state.storage[sIdx];
          state.storage[sIdx] = temp;
          SFX.playClick();
          saveGame();
          updateAllHUD();
          openMenuModal("party");
        };
      });
      document.getElementById("btnPartyHealAll").onclick = () => {
        healAllParty(true);
        openMenuModal("party");
      };
      return;
    }

    if (tab === "bag") {
      const ownedRows = DATA.shopItems
        .filter((it) => it.effect !== "vehicle" && (state.items[it.id] || 0) > 0)
        .map((it) => {
          const count = state.items[it.id] || 0;
          const iconEmoji =
            it.effect === "capture" ? "🔴" : it.effect === "heal" ? "🧪" : it.effect === "herb" ? "🌿" : "✨";
          const actionBtn =
            it.effect === "capture"
              ? `<small style="font-weight:800;color:#64748b;">於野外對戰中使用</small>`
              : `<button type="button" class="button primary" data-use-bag="${it.id}">使用 (Use)</button>`;
          return `
          <div class="catalog-row">
            <div class="item-icon-box" style="background:${it.color}22;border-color:${it.color};">${iconEmoji}</div>
            <div>
              <strong>${it.name} × ${count}</strong>
              <p>${it.description}</p>
            </div>
            ${actionBtn}
          </div>
        `;
        })
        .join("");

      bodyEl.innerHTML = `
        <div class="wallet">
          <span>🪙 持有金幣：₽ ${state.coins}</span>
          <button type="button" class="button gold" id="btnBagToShop">🏪 前往寶可夢商店購買道具</button>
        </div>
        ${state.repelSteps > 0 ? `<p style="color:#15803d;font-weight:800;margin-bottom:8px;">🌿 除蟲噴霧效果剩餘：${state.repelSteps} 步</p>` : ""}
        <div class="catalog-list">
          ${ownedRows || `<p style="color:#64748b;">背包目前沒有道具，快去地圖開啟寶箱或前往商店購買吧！</p>`}
        </div>
      `;

      document.getElementById("btnBagToShop").onclick = () => openMenuModal("shop");
      bodyEl.querySelectorAll("button[data-use-bag]").forEach((btn) => {
        btn.onclick = () => {
          useBagItemOutOfBattle(btn.getAttribute("data-use-bag"));
          openMenuModal("bag");
        };
      });
      return;
    }

    if (tab === "shop") {
      const shopRows = DATA.shopItems
        .map((it) => {
          const ownedCount = it.effect === "vehicle" ? (state.ownedBicycle ? 1 : 0) : state.items[it.id] || 0;
          const canBuy = state.coins >= it.price && !(it.effect === "vehicle" && state.ownedBicycle);
          const iconEmoji =
            it.effect === "capture"
              ? "🔴"
              : it.effect === "heal"
              ? "🧪"
              : it.effect === "vehicle"
              ? "🚲"
              : it.effect.includes("boost")
              ? "🏅"
              : "✨";
          return `
          <div class="catalog-row">
            <div class="item-icon-box" style="background:${it.color}22;border-color:${it.color};">${iconEmoji}</div>
            <div>
              <strong>${it.name}</strong>
              <p>${it.description}</p>
              <small style="color:#475569;font-weight:800;">目前持有：${it.effect === "vehicle" ? (state.ownedBicycle ? "已擁有" : "未購買") : ownedCount + " 個"}</small>
            </div>
            <button type="button" class="button ${canBuy ? "primary" : ""}" data-buy-id="${it.id}" ${!canBuy ? "disabled" : ""}>
              ${it.effect === "vehicle" && state.ownedBicycle ? "已購買" : `購買 · ₽${it.price}`}
            </button>
          </div>
        `;
        })
        .join("");

      bodyEl.innerHTML = `
        <div class="wallet">
          <span>🪙 訓練家錢包金幣：₽ ${state.coins}</span>
          <button type="button" class="button" id="btnShopFreeHeal">💖 喬伊小姐免費全隊恢復 HP</button>
        </div>
        <p style="font-size:15px;color:#334155;margin-bottom:10px;">
          💡 在五大地圖開啟<strong>金幣寶箱</strong>或完成<strong>國語/數學道館訓練</strong>皆可獲得金幣（₽），用來購買高級精靈球、傷藥、永久攻防護符與越野腳踏車！
        </p>
        <div class="catalog-list">${shopRows}</div>
      `;

      document.getElementById("btnShopFreeHeal").onclick = () => healAllParty(true);
      bodyEl.querySelectorAll("button[data-buy-id]").forEach((btn) => {
        btn.onclick = () => {
          buyShopItem(btn.getAttribute("data-buy-id"));
          openMenuModal("shop");
        };
      });
      return;
    }

    if (tab === "map") {
      const lead = getLeadPokemon();
      const atlasCards = DATA.regionsOrder
        .map((rId) => {
          const r = DATA.regions[rId];
          const isHere = state.regionId === rId;
          const chestsInMap = (r.objects || []).filter((o) => o.kind === "chest");
          const openedInMap = chestsInMap.filter((o) => state.collectedChests.includes(o.id)).length;
          const wildList = DATA.pokemonCatalog
            .filter((p) => p.regionId === rId)
            .map((p) => `${p.name}(Lv.${p.minLv})`)
            .join("、");
          const powerEnough = lead && lead.atk >= r.recAtk && lead.def >= r.recDef;

          return `
          <div class="${isHere ? "here" : ""}">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <strong style="font-size:19px;font-weight:900;color:#0f172a;">
                  ${isHere ? "▶ " : ""}${r.name}
                </strong>
                <span style="font-size:13px;font-weight:900;padding:2px 8px;border-radius:4px;background:${powerEnough ? "#dcfce7" : "#fee2e2"};color:${powerEnough ? "#166534" : "#991b1b"};">
                  ${r.tierLabel}
                </span>
              </div>
              <p style="font-size:14px;color:#334155;margin-top:4px;">${r.description}</p>
              <div style="font-size:13px;font-weight:800;color:#1e3a8a;margin-top:6px;">
                ⚔️ 建議攻擊力：${r.recAtk}+ · 🛡️ 建議防禦力：${r.recDef}+ · 🎁 寶箱：${openedInMap}/${chestsInMap.length}
              </div>
              <div style="font-size:13px;color:#475569;margin-top:3px;">
                🐾 出沒寶可夢：${wildList}
              </div>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:6px;">
              <button type="button" class="button ${isHere ? "" : "primary"}" data-travel-id="${rId}" ${isHere ? "disabled" : ""}>
                ${isHere ? "📍 目前所在區域" : `🚀 傳送前往 ${r.name.split(" ")[0]}`}
              </button>
            </div>
          </div>
        `;
        })
        .join("");

      bodyEl.innerHTML = `
        <p style="font-size:16px;color:#334155;">
          你可以從<strong>柳溪 (Willowbrook)</strong> 往北、南、東、西四個出口走到各個野外地圖，或直接點擊下方按鈕快速前往。<br />
          <strong style="color:#b91c1c;">⚠️ 提示：初始寶可夢只有 Lv.1，請先在柳溪的「國語文道館」與「數學道館」訓練達標後，再依序挑戰第 1～5 階地圖！</strong>
        </p>
        <div class="world-atlas">${atlasCards}</div>
      `;

      bodyEl.querySelectorAll("button[data-travel-id]").forEach((btn) => {
        btn.onclick = () => {
          const targetId = btn.getAttribute("data-travel-id");
          modal.classList.add("hidden");
          travelToRegion(targetId);
        };
      });
      return;
    }

    if (tab === "codex") {
      const codexHtml = DATA.pokemonCatalog
        .map((cat) => {
          const caught = state.caughtIds.includes(cat.id);
          const regName = cat.regionId === "starter" ? "初始夥伴" : (DATA.regions[cat.regionId]?.name || cat.regionId);
          return `
          <div class="catalog-row" style="opacity:${caught ? "1" : "0.65"};background:${caught ? "#e8f5e9" : "#f1f5f9"};">
            <img src="${getPortraitUrl(cat.id4)}" onerror="this.src='${getStaticSpriteUrl(cat.id)}'" style="width:56px;height:56px;image-rendering:pixelated;border-radius:6px;border:2px solid #94a3b8;" />
            <div>
              <strong>#${cat.id4} ${cat.name} (${cat.enName}) ${caught ? "✅ 已收服" : "🔒 未收服"}</strong>
              <p>${cat.desc}</p>
              <small style="color:#1e40af;font-weight:800;">屬性：${cat.type} · 棲息地：${regName} (Lv.${cat.minLv}+) · 絕招：${cat.move}</small>
            </div>
          </div>
        `;
        })
        .join("");

      bodyEl.innerHTML = `
        <p style="margin-bottom:10px;font-weight:800;">
          📖 已收服寶可夢圖鑑：<strong>${state.caughtIds.length} / ${DATA.pokemonCatalog.length} 種</strong>（打敗野生寶可夢後丟出精靈球約 60% 機率收服）
        </p>
        <div class="catalog-list">${codexHtml}</div>
      `;
      return;
    }

    if (tab === "trainer") {
      const lead = getLeadPokemon();
      bodyEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:3px solid #94a3b8;">
          <img src="assets/trainer.png" alt="訓練家" style="width:56px;height:78px;image-rendering:pixelated;" />
          <div>
            <strong style="font-size:28px;font-weight:900;">訓練家：${state.trainerName}</strong>
            <div style="font-size:16px;color:#475569;margin-top:4px;">
              稱號：${state.atkBonus >= 20 && state.defBonus >= 20 ? "🏆 文武雙全道館大師" : "🌱 柳溪谷見習訓練家"}
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;font-size:17px;">
          <div style="background:#e8ecd8;padding:10px;border:2px solid #a0b0a8;">🐾 擁有寶可夢總數：<strong>${state.party.length + state.storage.length} 隻</strong></div>
          <div style="background:#e8ecd8;padding:10px;border:2px solid #a0b0a8;">📖 圖鑑收服進度：<strong>${state.caughtIds.length} / ${DATA.pokemonCatalog.length}</strong></div>
          <div style="background:#fee2e2;padding:10px;border:2px solid #f87171;">⚔️ 國語文道館攻擊加成：<strong>+${state.atkBonus}</strong></div>
          <div style="background:#dbeafe;padding:10px;border:2px solid #60a5fa;">🛡️ 數學道館防禦加成：<strong>+${state.defBonus}</strong></div>
          <div style="background:#fef9c3;padding:10px;border:2px solid #facc15;">🪙 持有金幣：<strong>₽ ${state.coins}</strong></div>
          <div style="background:#f3e8ff;padding:10px;border:2px solid #c084fc;">🎁 已開啟地圖寶箱：<strong>${state.collectedChests.length} / 16</strong></div>
        </div>
        ${lead ? `<p style="font-size:16px;color:#334155;">目前出戰隊長：<strong>${lead.name} Lv.${lead.level}</strong>（⚔️ATK ${lead.atk} / 🛡️DEF ${lead.def} / HP ${lead.hp}/${lead.maxHp}）</p>` : ""}
      `;
    }
  }

  function buyShopItem(itemId) {
    const item = DATA.shopItems.find((it) => it.id === itemId);
    if (!item) return;
    if (state.coins < item.price) {
      SFX.playWrong();
      showToast("⚠️ 金幣不足！快去地圖上尋找寶箱或到道館答題賺取金幣（₽）！");
      return;
    }
    state.coins -= item.price;
    SFX.playChest();

    if (item.effect === "vehicle") {
      state.ownedBicycle = true;
      state.ridingBicycle = true;
      showToast("🚲 恭喜購買【越野腳踏車】！現在你在戶外地圖的移動速度大幅提升了！");
    } else if (item.effect === "atk-boost") {
      state.atkBonus += item.power;
      state.party.forEach((p) => {
        p.atk += item.power;
        p.level += 1;
      });
      showToast(`⚔️ 使用【${item.name}】！全隊寶可夢永久提升攻擊力 +${item.power} 並升 1 級！`);
    } else if (item.effect === "def-boost") {
      state.defBonus += item.power;
      state.party.forEach((p) => {
        p.def += item.power;
        p.maxHp += 15;
        p.hp = p.maxHp;
        p.level += 1;
      });
      showToast(`🛡️ 使用【${item.name}】！全隊寶可夢永久提升防禦力 +${item.power}、最大HP +15！`);
    } else {
      state.items[itemId] = (state.items[itemId] || 0) + 1;
      showToast(`🛍️ 成功購買【${item.name}】×1！（剩餘金幣 ₽${state.coins}）`);
    }
    saveGame();
    updateAllHUD();
  }

  function useBagItemOutOfBattle(itemId) {
    const item = DATA.shopItems.find((it) => it.id === itemId);
    if (!item || (state.items[itemId] || 0) <= 0) return;
    const lead = getLeadPokemon();
    if (!lead) return;

    state.items[itemId]--;
    SFX.playHeal();

    if (item.effect === "heal") {
      lead.hp = Math.min(lead.maxHp, lead.hp + item.power);
      showToast(`💖 對【${lead.name}】使用了${item.name}，恢復 ${item.power} HP！`);
    } else if (item.effect === "revive") {
      lead.hp = Math.max(lead.hp, Math.round(lead.maxHp * 0.5));
      showToast(`✨ 【${lead.name}】恢復了精神與一半 HP！`);
    } else if (item.effect === "pp") {
      lead.attackPp = Math.min(lead.maxAttackPp, lead.attackPp + 10);
      lead.specialPp = Math.min(lead.maxSpecialPp, lead.specialPp + 10);
      showToast(`🧪 【${lead.name}】的招式 PP 恢復了 10 點！`);
    } else if (item.effect === "repel") {
      state.repelSteps = 100;
      showToast("🌿 已噴灑除蟲噴霧！接下來 100 步內不會遇到野生寶可夢。");
    } else if (item.effect === "atk-boost") {
      state.atkBonus += item.power;
      state.party.forEach((p) => (p.atk += item.power));
      showToast(`⚔️ 全隊攻擊力永久提升 +${item.power}！`);
    } else if (item.effect === "def-boost") {
      state.defBonus += item.power;
      state.party.forEach((p) => {
        p.def += item.power;
        p.maxHp += 15;
        p.hp = p.maxHp;
      });
      showToast(`🛡️ 全隊防禦力永久提升 +${item.power}、最大HP +15！`);
    }
    saveGame();
    updateAllHUD();
  }


  // --------------------------------------------------------------------------
  // 國語文道館（南一版第 1~6 課）— 提升攻擊力 ATK
  // (a) 初階：語音出題 ＋ iPad 繁體中文田字格手寫辨識
  // (b) 中階：照樣造句／詞語造句
  // (c) 高階：閱讀測驗
  // --------------------------------------------------------------------------
  let chState = {
    tier: "a",
    qIndexA: 0,
    qIndexB: 0,
    qIndexC: 0,
    recognizedChars: [],
    showTraceGuide: false,
    selectedBlocks: []
  };

  function openChineseGym(defaultTier = null) {
    SFX.playClick();
    if (defaultTier) chState.tier = defaultTier;
    document.getElementById("chineseGymModal").classList.remove("hidden");
    switchChineseTier(chState.tier);
  }

  function switchChineseTier(tier) {
    chState.tier = tier;
    ["a", "b", "c"].forEach((t) => {
      const btn = document.getElementById(`chTab_${t}`);
      if (btn) { btn.classList.toggle("active", t === tier); btn.classList.toggle("active-chinese", t === tier); btn.classList.toggle("active-math", t === tier); }
    });
    if (tier === "a") renderChineseDictation();
    else if (tier === "b") renderChineseSentence();
    else renderChineseReading();
  }

  // --- (a) 初階：語音出題 + iPad 田字格手寫生字 ---
  function renderChineseDictation() {
    const list = DATA.chineseGym.dictationQuestions;
    const q = list[chState.qIndexA % list.length];
    const container = document.getElementById("chineseGymBody");
    const chars = Array.from(q.word);
    chState.recognizedChars = chars.map(() => "");
    chState.showRadicalHint = false;
    chState.showStrokeHint = false;

    const radicalText = (q.radicals || [])
      .map((r, i) => `第 ${i + 1} 字部首：【${r}】`)
      .join("　｜　");
    const firstStrokeText = (q.firstStrokes || [])
      .map((s, i) => `第 ${i + 1} 字第一筆畫：【${s}】`)
      .join("　｜　");

    container.innerHTML = `
      <div class="dictation-panel">
        <div class="voice-prompt-bar">
          <div>
            <span class="brand-badge" style="background:#b83828">${q.lesson}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">第 ${(chState.qIndexA % list.length) + 1} / ${list.length} 題 · 語音聽寫生字（共 ${chars.length} 字）</strong>
            <div style="margin-top:6px;font-size:0.95rem;color:#485868;font-weight:700;">
              🎧 請點擊右側「播放語音出題」仔細聽題目，並在下方田字格寫出正確的國字。
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="voice-play-btn" id="btnPlayDictationVoice">
              🔊 播放語音出題
            </button>
          </div>
        </div>

        <div style="text-align:center;font-weight:800;color:#485868;font-size:0.95rem;">
          ✍️ 請用手指、Apple Pencil 或滑鼠在下方空白田字格中寫出繁體中文字：
        </div>

        <div class="tianzige-row" id="tianzigeRow"></div>

        <!-- 下方僅提供 2 個選項的提示：1. 部首提示、2. 第一筆畫提示 -->
        <div style="margin-top:14px;padding:12px 16px;background:#fdf8ec;border:2px solid #d8c8a8;border-radius:10px;">
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;">
            <span style="font-weight:900;color:#684828;font-size:0.95rem;">💡 需要提示嗎？請選擇：</span>
            <button type="button" class="hud-btn" id="btnHintRadical" style="background:#fff3d6;color:#7c4d12;border-color:#c8963e;font-weight:900;">
              1. 部首提示
            </button>
            <button type="button" class="hud-btn" id="btnHintFirstStroke" style="background:#eef6ff;color:#1e4e8c;border-color:#5a90d6;font-weight:900;">
              2. 第一筆畫提示
            </button>
          </div>
          <div id="hintRadicalBox" style="display:none;margin-top:10px;padding:8px 12px;background:#fff9eb;border-left:4px solid #d89028;font-weight:800;color:#683810;text-align:center;">
            🔍 <strong>部首提示：</strong>${radicalText}
          </div>
          <div id="hintStrokeBox" style="display:none;margin-top:8px;padding:8px 12px;background:#f0f7ff;border-left:4px solid #3878c8;font-weight:800;color:#183868;text-align:center;">
            ✏️ <strong>第一筆畫提示：</strong>${firstStrokeText}
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px;padding-top:12px;border-top:2px dashed #d8ceb8;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;">目前辨識結果：</span>
            <div id="dictationResultSlots" style="display:flex;gap:8px;"></div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="hud-btn" id="btnPrevDictation">⬅️ 上一題</button>
            <button type="button" class="btn-pixel-lg" id="btnSubmitDictation" style="padding:8px 20px;font-size:1.05rem;">
              ✅ 檢查手寫答案 (攻擊力 +${q.atkBonus})
            </button>
            <button type="button" class="hud-btn" id="btnNextDictation">下一題 ➡️</button>
          </div>
        </div>
        <div id="dictationFeedback" style="margin-top:12px;font-weight:800;font-size:1.08rem;"></div>
      </div>
    `;

    const rowEl = document.getElementById("tianzigeRow");
    const slotsEl = document.getElementById("dictationResultSlots");

    chars.forEach((targetChar, idx) => {
      // 結果槽
      const slot = document.createElement("div");
      slot.className = "recognized-slot";
      slot.id = `recSlot_${idx}`;
      slot.textContent = "？";
      slotsEl.appendChild(slot);

      // 田字格單元（完全不顯示描紅底字）
      const unit = document.createElement("div");
      unit.className = "tianzige-unit";
      unit.innerHTML = `
        <div style="font-weight:900;color:#882820;">第 ${idx + 1} 字（共 ${chars.length} 字）</div>
        <div class="tianzige-box">
          <canvas class="handwrite-canvas" id="hwCanvas_${idx}" width="220" height="220"></canvas>
        </div>
        <div class="candidate-strip" id="candStrip_${idx}">
          <span style="font-size:0.82rem;color:#788898;">動筆書寫後顯示辨識字...</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="hud-btn" id="clearHw_${idx}" style="font-size:0.82rem;padding:4px 10px;">🧹 重寫此字</button>
        </div>
      `;
      rowEl.appendChild(unit);

      setupHandwritingCanvas(idx, targetChar);
    });

    // 綁定按鈕事件
    document.getElementById("btnPlayDictationVoice").onclick = () => {
      SFX.speak(q.voicePrompt);
    };
    document.getElementById("btnHintRadical").onclick = () => {
      SFX.playClick();
      chState.showRadicalHint = !chState.showRadicalHint;
      const box = document.getElementById("hintRadicalBox");
      if (box) box.style.display = chState.showRadicalHint ? "block" : "none";
    };
    document.getElementById("btnHintFirstStroke").onclick = () => {
      SFX.playClick();
      chState.showStrokeHint = !chState.showStrokeHint;
      const box = document.getElementById("hintStrokeBox");
      if (box) box.style.display = chState.showStrokeHint ? "block" : "none";
    };
    document.getElementById("btnPrevDictation").onclick = () => {
      chState.qIndexA = (chState.qIndexA - 1 + list.length) % list.length;
      renderChineseDictation();
    };
    document.getElementById("btnNextDictation").onclick = () => {
      chState.qIndexA = (chState.qIndexA + 1) % list.length;
      renderChineseDictation();
    };
    document.getElementById("btnSubmitDictation").onclick = () => {
      checkDictationAnswer(q);
    };

    // 自動朗讀題目
    setTimeout(() => SFX.speak(q.voicePrompt), 250);
  }

  // 田字格手寫與即時繁體中文辨識引擎
  function setupHandwritingCanvas(idx, targetChar) {
    const cvs = document.getElementById(`hwCanvas_${idx}`);
    if (!cvs) return;
    const c = cvs.getContext("2d");
    let drawing = false;
    let strokes = [];
    let currentStroke = [[], []];
    let strokeLength = 0;
    let recogTimer = null;

    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 7;
    c.strokeStyle = "#1c2838";

    function getPos(e) {
      const rect = cvs.getBoundingClientRect();
      const touch = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: ((touch.clientX - rect.left) / rect.width) * cvs.width,
        y: ((touch.clientY - rect.top) / rect.height) * cvs.height
      };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      currentStroke = [[Math.round(p.x)], [Math.round(p.y)]];
      c.beginPath();
      c.moveTo(p.x, p.y);
    }

    function moveDraw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      const lastX = currentStroke[0][currentStroke[0].length - 1];
      const lastY = currentStroke[1][currentStroke[1].length - 1];
      strokeLength += Math.hypot(p.x - lastX, p.y - lastY);

      currentStroke[0].push(Math.round(p.x));
      currentStroke[1].push(Math.round(p.y));
      c.lineTo(p.x, p.y);
      c.stroke();
    }

    function endDraw() {
      if (!drawing) return;
      drawing = false;
      if (currentStroke[0].length > 0) {
        strokes.push(currentStroke);
      }
      if (recogTimer) clearTimeout(recogTimer);
      recogTimer = setTimeout(() => {
        recognizeChineseInk(idx, strokes);
      }, 380);
    }

    cvs.addEventListener("mousedown", startDraw);
    cvs.addEventListener("mousemove", moveDraw);
    window.addEventListener("mouseup", endDraw);
    cvs.addEventListener("touchstart", startDraw, { passive: false });
    cvs.addEventListener("touchmove", moveDraw, { passive: false });
    cvs.addEventListener("touchend", endDraw);

    document.getElementById(`clearHw_${idx}`).onclick = () => {
      c.clearRect(0, 0, cvs.width, cvs.height);
      strokes = [];
      strokeLength = 0;
      setRecognizedChar(idx, "");
      document.getElementById(`candStrip_${idx}`).innerHTML =
        `<span style="font-size:0.82rem;color:#788898;">已清除，請重新書寫...</span>`;
    };
  }

  async function recognizeChineseInk(idx, strokes) {
    const strip = document.getElementById(`candStrip_${idx}`);
    if (!strip || strokes.length === 0) return;

    try {
      const payload = {
        app_version: 0.4,
        api_level: "537.36",
        device: "5.0",
        input_type: 0,
        options: "enable_pre_space",
        requests: [
          {
            writing_guide: { writing_area_width: 220, writing_area_height: 220 },
            pre_context: "",
            max_num_results: 8,
            max_completions: 0,
            language: "zh-TW",
            ink: strokes
          }
        ]
      };

      const resp = await fetch(
        "https://inputtools.google.com/request?itc=zh-hant-t-i0-handwrit&app=demopage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await resp.json();
      if (data && data[0] === "SUCCESS" && data[1] && data[1][0] && data[1][0][1]) {
        const cands = data[1][0][1];
        if (cands[0]) {
          setRecognizedChar(idx, cands[0]);
        }
        renderCandidates(idx, cands);
        return;
      }
    } catch (e) {}
  }

  function renderCandidates(idx, cands) {
    const strip = document.getElementById(`candStrip_${idx}`);
    if (!strip) return;
    strip.innerHTML = "";
    cands.slice(0, 6).forEach((ch) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "candidate-btn" + (ch === chState.recognizedChars[idx] ? " matched" : "");
      btn.textContent = ch;
      btn.onclick = () => {
        SFX.playClick();
        setRecognizedChar(idx, ch);
        renderCandidates(idx, cands);
      };
      strip.appendChild(btn);
    });
  }

  function setRecognizedChar(idx, charVal) {
    chState.recognizedChars[idx] = charVal;
    const slot = document.getElementById(`recSlot_${idx}`);
    if (slot) {
      slot.textContent = charVal || "？";
      slot.classList.remove("correct");
    }
  }

  function checkDictationAnswer(q) {
    const written = chState.recognizedChars.join("");
    const fb = document.getElementById("dictationFeedback");
    if (written === q.word) {
      Array.from(q.word).forEach((_, idx) => {
        const slot = document.getElementById(`recSlot_${idx}`);
        if (slot) slot.classList.add("correct");
      });
      SFX.playCorrect();
      SFX.speak(`太棒了！你正確寫出了「${q.word}」！寶可夢攻擊力提升 ${q.atkBonus} 點！`);
      rewardChineseTraining(q.atkBonus, q.id);
      if (fb) {
        fb.style.color = "#187838";
        fb.innerHTML = `🎉 答對了！你親手寫出了「<strong>${q.word}</strong>」！出戰寶可夢【攻擊力 +${q.atkBonus}】！`;
      }
    } else {
      SFX.playWrong();
      if (fb) {
        fb.style.color = "#c83028";
        fb.innerHTML = `⚠️ 目前辨識為「${written || "尚未寫完"}」，還不太正確喔！請再點選「🔊 播放語音出題」聽一次，或點擊下方「1. 部首提示」、「2. 第一筆畫提示」！`;
      }
    }
  }

  // --- (b) 中階：照樣造句／詞語造句活動 ---
  function renderChineseSentence() {
    const list = DATA.chineseGym.sentenceQuestions;
    const q = list[chState.qIndexB % list.length];
    chState.selectedBlocks = [];
    const allBlocks = [...q.blocks, ...q.distractors].sort(() => Math.random() - 0.5);

    const container = document.getElementById("chineseGymBody");
    container.innerHTML = `
      <div class="dictation-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#b83828">${q.lesson}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">${q.type}（第 ${(chState.qIndexB % list.length) + 1} / ${list.length} 題）</strong>
          </div>
          <button type="button" class="voice-play-btn" id="btnSpeakSentenceExample" style="padding:6px 14px;font-size:0.95rem;">
            🔊 朗讀範例與題目
          </button>
        </div>

        <div style="margin-top:12px;padding:12px;background:#fff5eb;border-left:5px solid #e06040;border-radius:4px;">
          <div style="font-weight:900;color:#882818;">📌 句型結構：${q.pattern}</div>
          <div style="margin-top:4px;font-weight:700;color:#384858;">${q.example}</div>
        </div>

        <p style="margin:12px 0 6px;font-weight:800;font-size:1.05rem;">👉 ${q.prompt}（點擊下方語詞積木組合成完整句子）：</p>

        <div class="sentence-builder-zone" id="sentenceBuilderZone">
          <span style="color:#788898;">請依序點選下方語詞積木放入此處...</span>
        </div>

        <div class="word-block-pool" id="wordBlockPool"></div>

        <div style="margin-top:14px;padding:10px 14px;background:#f8fafd;border:2px solid #cbd5e0;border-radius:6px;">
          <label style="font-weight:800;font-size:0.95rem;display:block;margin-bottom:6px;">
            ✍️ 自由造句延伸練習（可自己打字或用 iPad 手寫鍵盤輸入你的創意造句）：
          </label>
          <input type="text" id="customSentenceInput" placeholder="也可以在這裡自己造一句話喔！" style="width:100%;padding:8px 12px;font-size:1.05rem;border:2px solid #90a4c0;border-radius:5px;" />
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px;">
          <button type="button" class="hud-btn" id="btnResetSentence">🔄 重新排列</button>
          <div style="display:flex;gap:10px;">
            <button type="button" class="hud-btn" id="btnPrevSentence">⬅️ 上一題</button>
            <button type="button" class="btn-pixel-lg" id="btnCheckSentence" style="padding:8px 20px;font-size:1.05rem;">
              ✅ 檢查造句 (攻擊力 +${q.atkBonus})
            </button>
            <button type="button" class="hud-btn" id="btnNextSentence">下一題 ➡️</button>
          </div>
        </div>
        <div id="sentenceFeedback" style="margin-top:12px;font-weight:800;font-size:1.05rem;"></div>
      </div>
    `;

    const poolEl = document.getElementById("wordBlockPool");
    const zoneEl = document.getElementById("sentenceBuilderZone");

    function refreshSentenceUI() {
      zoneEl.innerHTML = "";
      if (chState.selectedBlocks.length === 0) {
        zoneEl.innerHTML = `<span style="color:#788898;">請依序點選下方語詞積木放入此處...</span>`;
      } else {
        chState.selectedBlocks.forEach((b, i) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "word-chip selected-chip";
          chip.textContent = b;
          chip.onclick = () => {
            SFX.playClick();
            chState.selectedBlocks.splice(i, 1);
            refreshSentenceUI();
          };
          zoneEl.appendChild(chip);
        });
      }

      poolEl.innerHTML = "";
      allBlocks.forEach((b) => {
        const usedCount = chState.selectedBlocks.filter((x) => x === b).length;
        const totalCount = allBlocks.filter((x) => x === b).length;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "word-chip";
        btn.textContent = b;
        btn.disabled = usedCount >= totalCount;
        btn.onclick = () => {
          SFX.playClick();
          chState.selectedBlocks.push(b);
          refreshSentenceUI();
        };
        poolEl.appendChild(btn);
      });
    }

    refreshSentenceUI();

    document.getElementById("btnSpeakSentenceExample").onclick = () => {
      SFX.speak(`${q.example}。${q.prompt}`);
    };
    document.getElementById("btnResetSentence").onclick = () => {
      chState.selectedBlocks = [];
      refreshSentenceUI();
    };
    document.getElementById("btnPrevSentence").onclick = () => {
      chState.qIndexB = (chState.qIndexB - 1 + list.length) % list.length;
      renderChineseSentence();
    };
    document.getElementById("btnNextSentence").onclick = () => {
      chState.qIndexB = (chState.qIndexB + 1) % list.length;
      renderChineseSentence();
    };
    document.getElementById("btnCheckSentence").onclick = () => {
      const built = chState.selectedBlocks.join("");
      const custom = (document.getElementById("customSentenceInput").value || "").trim();
      const fb = document.getElementById("sentenceFeedback");

      if (built === q.targetSentence || custom.length >= 6) {
        SFX.playCorrect();
        const finalSentence = built === q.targetSentence ? built : custom;
        SFX.speak(`造句成功！${finalSentence}`);
        rewardChineseTraining(q.atkBonus, q.id);
        fb.style.color = "#187838";
        fb.innerHTML = `🎉 太棒了！句子通順又優美：「<strong>${finalSentence}</strong>」<br><small>${q.explanation}（寶可夢攻擊力 +${q.atkBonus}！）</small>`;
      } else {
        SFX.playWrong();
        fb.style.color = "#c83028";
        fb.innerHTML = `⚠️ 語序還不太對喔！目前組出：「${built || "未選擇"}」。<br>💡 提示：請對照「${q.pattern}」的順序再試一次！`;
      }
    };
  }

  // --- (c) 高階：閱讀測驗活動 ---
  function renderChineseReading() {
    const list = DATA.chineseGym.readingQuestions;
    const item = list[chState.qIndexC % list.length];
    const container = document.getElementById("chineseGymBody");

    let qHtml = "";
    item.questions.forEach((qObj, qIdx) => {
      const opts = qObj.options
        .map(
          (opt, oIdx) =>
            `<button type="button" class="quiz-option-btn" data-qidx="${qIdx}" data-oidx="${oIdx}">(${
              ["A", "B", "C", "D"][oIdx]
            }) ${opt}</button>`
        )
        .join("");
      qHtml += `
        <div style="margin-top:14px;padding:12px;background:#ffffff;border:2px solid #d0c8b0;border-radius:8px;">
          <div style="font-weight:900;font-size:1.06rem;color:#1e2d38;">${qObj.q}</div>
          <div class="quiz-options-list" id="readOpts_${qIdx}">${opts}</div>
          <div id="readExp_${qIdx}" style="margin-top:8px;font-size:0.95rem;font-weight:800;"></div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="dictation-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#b83828">${item.lesson}</span>
            <strong style="font-size:1.2rem;margin-left:8px;">${item.title}</strong>
          </div>
          <button type="button" class="voice-play-btn" id="btnSpeakReading" style="padding:6px 14px;font-size:0.95rem;">
            🔊 語音朗讀短文
          </button>
        </div>

        <div style="margin-top:12px;padding:16px;background:#fffef8;border:2px solid #c8bca0;border-radius:8px;font-size:1.12rem;line-height:1.75;white-space:pre-line;color:#202c38;">${item.passage}</div>

        ${qHtml}

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
          <button type="button" class="hud-btn" id="btnPrevReading">⬅️ 上一篇</button>
          <span style="font-weight:800;color:#882818;">全部答對可獲【攻擊力 +${item.atkBonus}】與文采徽章進度！</span>
          <button type="button" class="hud-btn" id="btnNextReading">下一篇 ➡️</button>
        </div>
      </div>
    `;

    let answeredCorrect = {};

    container.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.onclick = () => {
        const qIdx = parseInt(btn.getAttribute("data-qidx"), 10);
        const oIdx = parseInt(btn.getAttribute("data-oidx"), 10);
        const qObj = item.questions[qIdx];
        const expEl = document.getElementById(`readExp_${qIdx}`);

        const parent = document.getElementById(`readOpts_${qIdx}`);
        parent.querySelectorAll(".quiz-option-btn").forEach((b) => b.classList.remove("correct", "wrong"));

        if (oIdx === qObj.answer) {
          SFX.playCorrect();
          btn.classList.add("correct");
          expEl.style.color = "#187838";
          expEl.innerHTML = `✅ 答對了！${qObj.explanation}`;
          answeredCorrect[qIdx] = true;

          if (Object.keys(answeredCorrect).length === item.questions.length) {
            rewardChineseTraining(item.atkBonus, item.id);
          }
        } else {
          SFX.playWrong();
          btn.classList.add("wrong");
          expEl.style.color = "#c83028";
          expEl.innerHTML = `❌ 再想一想喔！請仔細閱讀短文中的線索。`;
        }
      };
    });

    document.getElementById("btnSpeakReading").onclick = () => {
      SFX.speak(item.passage);
    };
    document.getElementById("btnPrevReading").onclick = () => {
      chState.qIndexC = (chState.qIndexC - 1 + list.length) % list.length;
      renderChineseReading();
    };
    document.getElementById("btnNextReading").onclick = () => {
      chState.qIndexC = (chState.qIndexC + 1) % list.length;
      renderChineseReading();
    };
  }

  function rewardChineseTraining(atkBonus, qId) {
    const lead = getLeadPokemon();
    if (!lead) return;
    const coinGain = atkBonus >= 7 ? 100 : atkBonus >= 5 ? 70 : 50;
    state.atkBonus = (state.atkBonus || 0) + atkBonus;
    state.coins = (state.coins || 0) + coinGain;

    state.party.forEach((p, i) => {
      const gain = i === state.activeIndex ? atkBonus : Math.max(2, Math.round(atkBonus * 0.7));
      p.atk += gain;
      p.atkTrained = (p.atkTrained || 0) + gain;
      p.level += 1;
      p.maxHp += 6;
      p.hp = p.maxHp;
    });
    state.storage.forEach((p) => {
      const gain = Math.max(2, Math.round(atkBonus * 0.5));
      p.atk += gain;
      p.level += 1;
    });

    state.chineseScore = (state.chineseScore || 0) + 10;
    if (qId && !state.completedQuestions.includes(qId)) {
      state.completedQuestions.push(qId);
    }
    if (state.chineseScore >= 30 && !state.badges.chinese) {
      state.badges.chinese = true;
      state.items["great-ball"] = (state.items["great-ball"] || 0) + 2;
      showToast(`🏅 恭喜獲得【國語道館・文采徽章】！全隊升級 Lv+1、攻擊+${atkBonus}、金幣+₽${coinGain}、超級球×2！`);
    } else {
      showToast(`📕 國語道館特訓成功！【${lead.name}】升至 Lv.${lead.level}，攻擊力 +${atkBonus}（現為 ${lead.atk}），獲得金幣 ₽${coinGain}！`);
    }
    saveGame();
    updateAllHUD();
  }

  // --------------------------------------------------------------------------
  // 數學道館（康軒版第 1~4 單元）— 提升防禦力 DEF 與 HP
  // (a) 初階：乘法與基本運算
  // (b) 中階：四位數加減（直式呈現＋iPad 直式手寫書寫）
  // (c) 高階：第 1~4 單元素養題與應用題解答
  // --------------------------------------------------------------------------
  let maState = {
    tier: "a",
    qIndexA: 0,
    qIndexB: 0,
    qIndexC: 0,
    verticalDigits: ["", "", "", ""], // 千、百、十、個
    activeDigitCol: 3 // 預設從「個位」(index 3) 開始算起！
  };

  function openMathGym(defaultTier = null) {
    SFX.playClick();
    if (defaultTier) maState.tier = defaultTier;
    document.getElementById("mathGymModal").classList.remove("hidden");
    switchMathTier(maState.tier);
  }

  function switchMathTier(tier) {
    maState.tier = tier;
    ["a", "b", "c"].forEach((t) => {
      const btn = document.getElementById(`maTab_${t}`);
      if (btn) { btn.classList.toggle("active", t === tier); btn.classList.toggle("active-chinese", t === tier); btn.classList.toggle("active-math", t === tier); }
    });
    if (tier === "a") renderMathBasic();
    else if (tier === "b") renderMathVertical();
    else renderMathWordProblem();
  }

  // --- (a) 初階：乘法等基本運算 ---
  function renderMathBasic() {
    const list = DATA.mathGym.basicQuestions;
    const q = list[maState.qIndexA % list.length];
    const container = document.getElementById("mathGymBody");

    const optsHtml = q.options
      .map(
        (opt) =>
          `<button type="button" class="quiz-option-btn" data-val="${opt}">🔹 ${opt}</button>`
      )
      .join("");

    container.innerHTML = `
      <div class="dictation-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#285898">${q.unit}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">第 ${(maState.qIndexA % list.length) + 1} / ${list.length} 題</strong>
          </div>
          <span style="font-weight:800;color:#2058a8;">🛡️ 答對獎勵：防禦力 +${q.defBonus} · 最大HP +6</span>
        </div>

        <div style="margin-top:12px;padding:16px;background:#f0f6ff;border:2px solid #78a0d8;border-radius:8px;font-size:1.22rem;font-weight:900;white-space:pre-line;color:#182c48;">${q.question}</div>

        <div class="quiz-options-list" id="mathBasicOpts">${optsHtml}</div>

        <div class="scratchpad-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.88rem;font-weight:800;color:#486078;">✏️ iPad 手寫計算草稿紙（可在下方空白處列直式算算看）：</span>
            <button type="button" class="hud-btn" id="btnClearBasicScratch" style="font-size:0.8rem;padding:3px 10px;">🧹 清除草稿</button>
          </div>
          <canvas class="scratchpad-canvas" id="basicScratchCanvas" width="760" height="140"></canvas>
        </div>

        <div id="mathBasicFeedback" style="margin-top:12px;font-weight:800;font-size:1.05rem;"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
          <button type="button" class="hud-btn" id="btnPrevMathBasic">⬅️ 上一題</button>
          <button type="button" class="hud-btn" id="btnNextMathBasic">下一題 ➡️</button>
        </div>
      </div>
    `;

    initFreeScratchpad("basicScratchCanvas", "btnClearBasicScratch");

    container.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.onclick = () => {
        const val = btn.getAttribute("data-val");
        const fb = document.getElementById("mathBasicFeedback");
        container.querySelectorAll(".quiz-option-btn").forEach((b) => b.classList.remove("correct", "wrong"));

        if (val === q.answer) {
          SFX.playCorrect();
          btn.classList.add("correct");
          rewardMathTraining(q.defBonus, q.id);
          fb.style.color = "#187838";
          fb.innerHTML = `🎉 答對了！正確答案是 <strong>${q.answer}</strong>！<br><small>💡 解析：${q.hint}</small>`;
        } else {
          SFX.playWrong();
          btn.classList.add("wrong");
          fb.style.color = "#c83028";
          fb.innerHTML = `⚠️ 算錯囉！提示：${q.hint}`;
        }
      };
    });

    document.getElementById("btnPrevMathBasic").onclick = () => {
      maState.qIndexA = (maState.qIndexA - 1 + list.length) % list.length;
      renderMathBasic();
    };
    document.getElementById("btnNextMathBasic").onclick = () => {
      maState.qIndexA = (maState.qIndexA + 1) % list.length;
      renderMathBasic();
    };
  }

  // --- (b) 中階：四位數加減（直式呈現 ＋ iPad 手寫直式計算） ---
  function renderMathVertical() {
    const list = DATA.mathGym.verticalQuestions;
    const q = list[maState.qIndexB % list.length];
    maState.verticalDigits = ["", "", "", ""];
    maState.activeDigitCol = 3; // 從個位開始算起

    const d1 = String(q.num1).padStart(4, " ").split("");
    const d2 = String(q.num2).padStart(4, " ").split("");

    const container = document.getElementById("mathGymBody");
    container.innerHTML = `
      <div class="dictation-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#285898">${q.unit}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">直式四位數加減特訓（第 ${(maState.qIndexB % list.length) + 1} / ${list.length} 題）</strong>
          </div>
          <button type="button" class="hud-btn" id="btnRandomVertical" style="font-size:0.88rem;">🎲 隨機出新題目</button>
        </div>

        <p style="margin:10px 0;font-size:1.08rem;font-weight:800;color:#203040;">📖 情境題：${q.story}</p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;align-items:start;">
          <!-- 左側：標準四位數直式計算板 -->
          <div class="vertical-math-board">
            <div class="place-value-header">
              <div></div>
              <div class="pv-tag pv-th">千位</div>
              <div class="pv-tag pv-hu">百位</div>
              <div class="pv-tag pv-te">十位</div>
              <div class="pv-tag pv-on">個位</div>
            </div>

            <!-- 進位 / 借位手寫標記小格 -->
            <div class="carry-row">
              <div style="font-size:0.75rem;font-weight:800;color:#885848;display:flex;align-items:center;justify-content:center;">進/退位</div>
              <input type="text" class="carry-input" placeholder="借/進" title="千位進退位紀錄" />
              <input type="text" class="carry-input" placeholder="借/進" title="百位進退位紀錄" />
              <input type="text" class="carry-input" placeholder="借/進" title="十位進退位紀錄" />
              <input type="text" class="carry-input" placeholder="借/進" title="個位進退位紀錄" />
            </div>

            <!-- 被加數 / 被減數 -->
            <div class="vertical-num-row">
              <div></div>
              <div>${d1[0]}</div>
              <div>${d1[1]}</div>
              <div>${d1[2]}</div>
              <div>${d1[3]}</div>
            </div>

            <!-- 運算符號 與 加數 / 減數 -->
            <div class="vertical-num-row">
              <div style="color:#c83828;">${q.op}</div>
              <div>${d2[0]}</div>
              <div>${d2[1]}</div>
              <div>${d2[2]}</div>
              <div>${d2[3]}</div>
            </div>

            <hr class="vertical-divider" />

            <!-- 直式答案格（千、百、十、個） -->
            <div class="vertical-ans-row">
              <div style="font-size:0.82rem;font-weight:900;color:#385078;text-align:center;">答案</div>
              <div class="digit-write-cell" id="vCell_0" data-col="0"></div>
              <div class="digit-write-cell" id="vCell_1" data-col="1"></div>
              <div class="digit-write-cell" id="vCell_2" data-col="2"></div>
              <div class="digit-write-cell active-cell" id="vCell_3" data-col="3"></div>
            </div>
            <div style="text-align:center;font-size:0.83rem;color:#586878;margin-top:8px;font-weight:700;">
              👆 點選上方「個位 → 十位 → 百位 → 千位」格子，可在右側手寫數字或點選數字鍵填入！
            </div>
          </div>

          <!-- 右側：iPad 手寫數字辨識格 ＋ 快速數字鍵盤 -->
          <div style="background:#ffffff;border:3px solid #7890b8;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-weight:900;color:#1e3a68;margin-bottom:6px;" id="activeColLabel">
              ✍️ 目前正在填寫：【個位】（請在下方框內手寫數字 0~9）
            </div>
            <div class="tianzige-box" style="margin:0 auto;border-color:#3868b8;width:165px;height:165px;">
              <canvas class="handwrite-canvas" id="mathDigitCanvas" width="180" height="180"></canvas>
            </div>
            <div style="display:flex;justify-content:center;gap:8px;margin-top:8px;">
              <button type="button" class="hud-btn" id="btnClearDigitCanvas" style="font-size:0.82rem;">🧹 重寫數字</button>
            </div>

            <div style="font-size:0.85rem;font-weight:800;color:#586878;margin-top:10px;">或直接點選數字鍵填入該位數：</div>
            <div class="numpad-bar" id="mathNumpadBar"></div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px;">
          <button type="button" class="hud-btn" id="btnPrevVertical">⬅️ 上一題</button>
          <button type="button" class="btn-pixel-lg" id="btnCheckVertical" style="background:#2868c8;padding:10px 26px;">
            ✅ 檢查直式計算結果 (防禦力 +${q.defBonus})
          </button>
          <button type="button" class="hud-btn" id="btnNextVertical">下一題 ➡️</button>
        </div>

        <div id="verticalFeedback" style="margin-top:12px;font-weight:800;font-size:1.06rem;"></div>
      </div>
    `;

    const colNames = ["千位", "百位", "十位", "個位"];

    function updateVerticalCellsUI() {
      for (let i = 0; i < 4; i++) {
        const cell = document.getElementById(`vCell_${i}`);
        if (!cell) continue;
        cell.textContent = maState.verticalDigits[i];
        cell.classList.toggle("active-cell", maState.activeDigitCol === i);
      }
      const lbl = document.getElementById("activeColLabel");
      if (lbl) {
        lbl.textContent = `✍️ 目前正在填寫：【${colNames[maState.activeDigitCol]}】（可手寫數字或點選下方數字鍵）`;
      }
    }

    for (let i = 0; i < 4; i++) {
      document.getElementById(`vCell_${i}`).onclick = () => {
        SFX.playClick();
        maState.activeDigitCol = i;
        updateVerticalCellsUI();
      };
    }

    // 數字鍵盤 0~9
    const numpad = document.getElementById("mathNumpadBar");
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "numpad-btn";
      b.textContent = String(n);
      b.onclick = () => {
        SFX.playClick();
        fillVerticalDigit(String(n), updateVerticalCellsUI);
      };
      numpad.appendChild(b);
    });

    // 手寫數字辨識畫布
    setupMathDigitCanvas(updateVerticalCellsUI);

    document.getElementById("btnPrevVertical").onclick = () => {
      maState.qIndexB = (maState.qIndexB - 1 + list.length) % list.length;
      renderMathVertical();
    };
    document.getElementById("btnNextVertical").onclick = () => {
      maState.qIndexB = (maState.qIndexB + 1) % list.length;
      renderMathVertical();
    };
    document.getElementById("btnRandomVertical").onclick = () => {
      // 動態產生新的四位數加減題
      const isAdd = Math.random() < 0.5;
      let n1 = 2000 + Math.floor(Math.random() * 6500);
      let n2 = 1100 + Math.floor(Math.random() * (isAdd ? 9800 - n1 : n1 - 1200));
      const ans = isAdd ? n1 + n2 : n1 - n2;
      DATA.mathGym.verticalQuestions.push({
        id: "ma_b_dyn_" + Date.now(),
        unit: isAdd ? "單元二：四位數直式加法（動態題）" : "單元二：四位數直式減法（動態題）",
        story: `道館能量計算練習：請用直式算出 ${n1} ${isAdd ? "＋" : "－"} ${n2} 的結果！`,
        op: isAdd ? "+" : "-",
        num1: n1,
        num2: n2,
        answer: ans,
        hint: `直式對齊個、十、百、千位計算：${n1} ${isAdd ? "+" : "-"} ${n2} = ${ans}。`,
        defBonus: 6
      });
      maState.qIndexB = DATA.mathGym.verticalQuestions.length - 1;
      renderMathVertical();
    };

    document.getElementById("btnCheckVertical").onclick = () => {
      const targetStr = String(q.answer).padStart(4, "0");
      let allMatch = true;
      for (let i = 0; i < 4; i++) {
        const cell = document.getElementById(`vCell_${i}`);
        if (maState.verticalDigits[i] === targetStr[i]) {
          cell.classList.add("correct-cell");
        } else {
          cell.classList.remove("correct-cell");
          allMatch = false;
        }
      }

      const fb = document.getElementById("verticalFeedback");
      if (allMatch) {
        SFX.playCorrect();
        rewardMathTraining(q.defBonus, q.id);
        fb.style.color = "#187838";
        fb.innerHTML = `🎉 直式計算完全正確！${q.num1} ${q.op} ${q.num2} ＝ <strong>${q.answer}</strong>！<br><small>🛡️ 寶可夢防禦力 +${q.defBonus}、最大 HP +10！</small>`;
      } else {
        SFX.playWrong();
        fb.style.color = "#c83028";
        fb.innerHTML = `⚠️ 還有位數算錯或沒填完喔！（綠色代表該位數正確）<br>💡 提示：${q.hint}`;
      }
    };
  }

  function fillVerticalDigit(digitStr, refreshFn) {
    maState.verticalDigits[maState.activeDigitCol] = digitStr;
    // 自動往左一個位數移動（個位 -> 十位 -> 百位 -> 千位）
    if (maState.activeDigitCol > 0) {
      maState.activeDigitCol--;
    }
    refreshFn();
  }

  function setupMathDigitCanvas(refreshFn) {
    const cvs = document.getElementById("mathDigitCanvas");
    if (!cvs) return;
    const c = cvs.getContext("2d");
    let drawing = false;
    let strokes = [];
    let currentStroke = [[], []];
    let timer = null;

    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 7;
    c.strokeStyle = "#184088";

    function getPos(e) {
      const rect = cvs.getBoundingClientRect();
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: ((t.clientX - rect.left) / rect.width) * cvs.width,
        y: ((t.clientY - rect.top) / rect.height) * cvs.height
      };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      currentStroke = [[Math.round(p.x)], [Math.round(p.y)]];
      c.beginPath();
      c.moveTo(p.x, p.y);
    }

    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      currentStroke[0].push(Math.round(p.x));
      currentStroke[1].push(Math.round(p.y));
      c.lineTo(p.x, p.y);
      c.stroke();
    }

    function end() {
      if (!drawing) return;
      drawing = false;
      if (currentStroke[0].length > 0) strokes.push(currentStroke);
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const payload = {
            app_version: 0.4,
            api_level: "537.36",
            device: "5.0",
            input_type: 0,
            options: "enable_pre_space",
            requests: [
              {
                writing_guide: { writing_area_width: 180, writing_area_height: 180 },
                pre_context: "",
                max_num_results: 5,
                max_completions: 0,
                language: "en",
                ink: strokes
              }
            ]
          };
          const r = await fetch(
            "https://inputtools.google.com/request?itc=en-t-i0-handwrit&app=demopage",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }
          );
          const d = await r.json();
          if (d && d[0] === "SUCCESS") {
            const cands = d[1][0][1] || [];
            const digit = cands.find((x) => /^[0-9]$/.test(x));
            if (digit !== undefined) {
              SFX.playClick();
              fillVerticalDigit(digit, refreshFn);
              c.clearRect(0, 0, cvs.width, cvs.height);
              strokes = [];
            }
          }
        } catch (err) {}
      }, 420);
    }

    cvs.addEventListener("mousedown", start);
    cvs.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    cvs.addEventListener("touchstart", start, { passive: false });
    cvs.addEventListener("touchmove", move, { passive: false });
    cvs.addEventListener("touchend", end);

    document.getElementById("btnClearDigitCanvas").onclick = () => {
      c.clearRect(0, 0, cvs.width, cvs.height);
      strokes = [];
    };
  }

  // --- (c) 高階：第 1 到 4 單元的素養題與應用題解答 ---
  function renderMathWordProblem() {
    const list = DATA.mathGym.wordProblems;
    const q = list[maState.qIndexC % list.length];
    const container = document.getElementById("mathGymBody");

    const optsHtml = q.options
      .map(
        (opt) =>
          `<button type="button" class="quiz-option-btn" data-val="${opt}">🔹 ${opt}</button>`
      )
      .join("");

    container.innerHTML = `
      <div class="dictation-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#285898">${q.unit}</span>
            <strong style="font-size:1.18rem;margin-left:8px;">${q.title}</strong>
          </div>
          <span style="font-weight:800;color:#2058a8;">🛡️ 答對獎勵：防禦力 +${q.defBonus} · 最大HP +12</span>
        </div>

        <div style="margin-top:12px;padding:16px;background:#f4f8ff;border:2px solid #7898c8;border-radius:8px;font-size:1.15rem;font-weight:800;line-height:1.65;white-space:pre-line;color:#182c48;">${q.question}</div>

        <div class="scratchpad-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.9rem;font-weight:800;color:#285078;">✏️ 素養應用題手寫計算區（請先在下方白板列式計算，再選出答案）：</span>
            <button type="button" class="hud-btn" id="btnClearWordScratch" style="font-size:0.8rem;padding:3px 10px;">🧹 清除計算紙</button>
          </div>
          <canvas class="scratchpad-canvas" id="wordScratchCanvas" width="760" height="150"></canvas>
        </div>

        <div class="quiz-options-list">${optsHtml}</div>

        <div id="wordProblemFeedback" style="margin-top:12px;font-weight:800;font-size:1.05rem;white-space:pre-line;"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
          <button type="button" class="hud-btn" id="btnPrevWordProb">⬅️ 上一題</button>
          <button type="button" class="hud-btn" id="btnNextWordProb">下一題 ➡️</button>
        </div>
      </div>
    `;

    initFreeScratchpad("wordScratchCanvas", "btnClearWordScratch");

    container.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.onclick = () => {
        const val = btn.getAttribute("data-val");
        const fb = document.getElementById("wordProblemFeedback");
        container.querySelectorAll(".quiz-option-btn").forEach((b) => b.classList.remove("correct", "wrong"));

        if (val === q.answer) {
          SFX.playCorrect();
          btn.classList.add("correct");
          rewardMathTraining(q.defBonus, q.id);
          fb.style.color = "#187838";
          fb.innerHTML = `🎉 恭喜解開素養應用題！答案正是 <strong>${q.answer}</strong>！\n📘 【解題步驟】：\n${q.stepsHint}`;
        } else {
          SFX.playWrong();
          btn.classList.add("wrong");
          fb.style.color = "#c83028";
          fb.innerHTML = `⚠️ 答案不對喔！請參考解題思路再算算看：\n${q.stepsHint}`;
        }
      };
    });

    document.getElementById("btnPrevWordProb").onclick = () => {
      maState.qIndexC = (maState.qIndexC - 1 + list.length) % list.length;
      renderMathWordProblem();
    };
    document.getElementById("btnNextWordProb").onclick = () => {
      maState.qIndexC = (maState.qIndexC + 1) % list.length;
      renderMathWordProblem();
    };
  }

  function initFreeScratchpad(canvasId, clearBtnId) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const c = cvs.getContext("2d");
    let drawing = false;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 3.5;
    c.strokeStyle = "#1c3868";

    function pos(e) {
      const r = cvs.getBoundingClientRect();
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: ((t.clientX - r.left) / r.width) * cvs.width,
        y: ((t.clientY - r.top) / r.height) * cvs.height
      };
    }

    cvs.addEventListener("mousedown", (e) => {
      drawing = true;
      const p = pos(e);
      c.beginPath();
      c.moveTo(p.x, p.y);
    });
    cvs.addEventListener("mousemove", (e) => {
      if (!drawing) return;
      const p = pos(e);
      c.lineTo(p.x, p.y);
      c.stroke();
    });
    window.addEventListener("mouseup", () => (drawing = false));

    cvs.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        drawing = true;
        const p = pos(e);
        c.beginPath();
        c.moveTo(p.x, p.y);
      },
      { passive: false }
    );
    cvs.addEventListener(
      "touchmove",
      (e) => {
        if (!drawing) return;
        e.preventDefault();
        const p = pos(e);
        c.lineTo(p.x, p.y);
        c.stroke();
      },
      { passive: false }
    );
    cvs.addEventListener("touchend", () => (drawing = false));

    const clr = document.getElementById(clearBtnId);
    if (clr) {
      clr.onclick = () => c.clearRect(0, 0, cvs.width, cvs.height);
    }
  }



  function rewardMathTraining(defBonus, qId) {
    const lead = getLeadPokemon();
    if (!lead) return;
    const hpGain = Math.round(defBonus * 3);
    const coinGain = defBonus >= 7 ? 100 : defBonus >= 5 ? 70 : 50;
    state.defBonus = (state.defBonus || 0) + defBonus;
    state.coins = (state.coins || 0) + coinGain;

    state.party.forEach((p, i) => {
      const dGain = i === state.activeIndex ? defBonus : Math.max(2, Math.round(defBonus * 0.7));
      p.def += dGain;
      p.defTrained = (p.defTrained || 0) + dGain;
      p.maxHp += hpGain;
      p.hp = p.maxHp;
      p.level += 1;
    });
    state.storage.forEach((p) => {
      const dGain = Math.max(2, Math.round(defBonus * 0.5));
      p.def += dGain;
      p.maxHp += 10;
      p.hp = p.maxHp;
      p.level += 1;
    });

    state.mathScore = (state.mathScore || 0) + 10;
    if (qId && !state.completedQuestions.includes(qId)) {
      state.completedQuestions.push(qId);
    }
    if (state.mathScore >= 30 && !state.badges.math) {
      state.badges.math = true;
      state.items["great-ball"] = (state.items["great-ball"] || 0) + 2;
      showToast(`🏅 恭喜獲得【數學道館・邏輯徽章】！全隊升級 Lv+1、防禦+${defBonus}、HP+${hpGain}、金幣+₽${coinGain}！`);
    } else {
      showToast(`📘 數學道館特訓成功！【${lead.name}】升至 Lv.${lead.level}，防禦力 +${defBonus}、最大HP +${hpGain}，獲得金幣 ₽${coinGain}！`);
    }
    saveGame();
    updateAllHUD();
  }

  // --------------------------------------------------------------------------
  // 9. HUD 狀態列、情境按鈕與通知更新
  // --------------------------------------------------------------------------
  function updateContextBar() {
    const obj = getFacingObject();
    const btn = document.getElementById("btnContextInteract");
    const txt = document.getElementById("contextActionText");
    const hint = document.getElementById("contextHintText");
    if (!btn || !txt) return;

    if (!obj) {
      txt.textContent = "調查周圍 / 對話";
      hint.textContent = "走到道館大門、商店、寶箱或 NPC 旁按 E 即可互動（或直接點擊地圖上的建築與寶箱）";
      return;
    }
    if (obj.kind === "door") {
      txt.textContent = obj.name || "進入建築";
      hint.textContent = "按下 E 或點擊左側按鈕立即進入！";
    } else if (obj.kind === "chest") {
      txt.textContent = `🎁 開啟【${obj.name}】領取金幣`;
      hint.textContent = "發現金幣寶箱！按 E 立即打開！";
    } else if (obj.kind === "npc") {
      txt.textContent = `💬 與 ${obj.name.split(" ")[0]} 對話`;
      hint.textContent = "按下 E 聽取指引或開啟訓練！";
    } else {
      txt.textContent = `🔍 查看 ${obj.name || "路標"}`;
      hint.textContent = "按下 E 閱讀詳細內容";
    }
  }

  function updateAllHUD() {
    const reg = getCurrentRegion();
    const lead = getLeadPokemon();

    // 左上角地區木牌
    document.getElementById("locationTitle").textContent = reg.name;
    document.getElementById("locationTier").textContent = `★ ${reg.tierLabel} · 建議戰力 ⚔️${reg.recAtk}+ / 🛡️${reg.recDef}+`;

    // 頂部狀態列 Pills
    const totalPokes = state.party.length + state.storage.length;
    document.getElementById("topPartyPill").textContent = `🐾 寶可夢：${totalPokes} 隻`;
    document.getElementById("topAtkPill").textContent = `⚔️ 國語攻擊 +${state.atkBonus || 0}`;
    document.getElementById("topDefPill").textContent = `🛡️ 數學防禦 +${state.defBonus || 0}`;
    document.getElementById("topCoinsPill").textContent = `🪙 金幣 ₽ ${state.coins || 0}`;
    const totalBalls =
      (state.items["poke-ball"] || 0) + (state.items["great-ball"] || 0) + (state.items["ultra-ball"] || 0);
    const totalPots =
      (state.items["potion"] || 0) + (state.items["super-potion"] || 0) + (state.items["hyper-potion"] || 0);
    document.getElementById("topBagPill").textContent = `🎒 球 ×${totalBalls} · 傷藥 ×${totalPots}`;

    // START 選單附註
    document.getElementById("menuPartyCount").textContent = `${state.party.length}/6`;
    document.getElementById("menuCoinsTxt").textContent = `₽${state.coins || 0}`;
    document.getElementById("menuTrainerName").textContent = `${state.trainerName} 名片`;

    // 腳踏車按鈕
    const bikeBtn = document.getElementById("btnToggleBike");
    if (bikeBtn) {
      bikeBtn.style.display = state.ownedBicycle ? "inline-flex" : "none";
      bikeBtn.textContent = state.ridingBicycle ? "🚲 下車步行" : "🚲 騎乘腳踏車";
    }

    // 寶箱進度
    document.getElementById("worldChestCounter").textContent = `🎁 已開啟地圖寶箱：${state.collectedChests.length} / 16 · 走出城鎮四個路口可前往五大地圖`;

    if (lead) {
      const hudImg = document.getElementById("hudLeaderImg");
      hudImg.src = getPortraitUrl(lead.id4);
      hudImg.onerror = () => {
        hudImg.src = getStaticSpriteUrl(lead.id);
      };
      document.getElementById("hudLeaderName").textContent = `${lead.name} · Lv.${lead.level}`;
      document.getElementById("hudLeaderStats").textContent = `⚔️ATK ${lead.atk} · 🛡️DEF ${lead.def} · HP ${lead.hp}/${lead.maxHp}`;
      const hpPct = Math.max(0, Math.min(100, (lead.hp / lead.maxHp) * 100));
      const hpBar = document.getElementById("hudLeaderHpBar");
      hpBar.style.width = `${hpPct}%`;
      hpBar.style.background = hpPct < 25 ? "#df7666" : hpPct < 50 ? "#e4be5e" : "#58b888";

      // 動態更新下方指引文字
      const objTitle = document.getElementById("objectiveTitle");
      const objDesc = document.getElementById("objectiveDesc");
      if (lead.atk < 12 || lead.def < 10) {
        objTitle.textContent = `📍 當前目標：先到「國語文道館」與「數學道館」訓練你的【${lead.name} Lv.${lead.level}】！`;
        objDesc.textContent = `目前【${lead.name}】攻擊力 ${lead.atk}、防禦力 ${lead.def}，還打不贏柳溪草地（建議 ⚔️12 / 🛡️10）的野生怪獸！請點選右側道館按鈕或走進城鎮建築特訓！`;
      } else {
        objTitle.textContent = `📍 當前目標：探索五大地圖、開啟寶箱收集金幣，收服更強的寶可夢！`;
        objDesc.textContent = `你的【${lead.name} Lv.${lead.level}】（⚔️ATK ${lead.atk} / 🛡️DEF ${lead.def}）已具備實戰能力！可走進草叢對戰收服寶可夢，或從北、南、東、西路口前往更高階地圖！`;
      }
    }

    updateContextBar();
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("gameToast");
    const txt = document.getElementById("gameToastText");
    if (!t || !txt) return;
    txt.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
    }, 3800);
  }

  // --------------------------------------------------------------------------
  // 10. 事件綁定與初始化 (Event Listeners & Boot)
  // --------------------------------------------------------------------------
  function bindEvents() {
    // 初始選擇確認
    document.getElementById("btnConfirmStarter").onclick = confirmStarterSelection;

    // 頂部狀態列點擊
    document.getElementById("topPartyPill").onclick = () => openMenuModal("party");
    document.getElementById("topAtkPill").onclick = () => openChineseGym("a");
    document.getElementById("topDefPill").onclick = () => openMathGym("a");
    document.getElementById("topCoinsPill").onclick = () => openMenuModal("shop");
    document.getElementById("topBagPill").onclick = () => openMenuModal("bag");
    document.getElementById("hudLeaderBadge").onclick = () => openMenuModal("party");

    document.getElementById("topSoundToggle").onclick = () => {
      SFX.enabled = !SFX.enabled;
      document.getElementById("topSoundToggle").textContent = SFX.enabled ? "🔊 音效：開" : "🔇 音效：關";
    };

    // 右上角地圖與 START 選單
    document.getElementById("btnHudMap").onclick = () => openMenuModal("map");
    const startMenu = document.getElementById("startMenu");
    document.getElementById("btnStartMenu").onclick = () => {
      SFX.playClick();
      startMenu.style.display = startMenu.style.display === "none" ? "grid" : "none";
    };

    startMenu.querySelectorAll("button[data-menu]").forEach((btn) => {
      btn.onclick = () => {
        const m = btn.getAttribute("data-menu");
        startMenu.style.display = "none";
        if (m === "close") return;
        if (m === "chinese-gym") openChineseGym("a");
        else if (m === "math-gym") openMathGym("a");
        else if (m === "reset") {
          if (confirm("確定要重置冒險進度並重新選擇初始寶可夢（皮卡丘／噴火龍／妙蛙種子）嗎？")) {
            localStorage.removeItem(SAVE_KEY);
            location.reload();
          }
        } else {
          openMenuModal(m);
        }
      };
    });

    // 關閉彈窗按鈕
    document.getElementById("closeMenuModal").onclick = () =>
      document.getElementById("menuModal").classList.add("hidden");
    document.getElementById("closeChineseGym").onclick = () =>
      document.getElementById("chineseGymModal").classList.add("hidden");
    document.getElementById("closeMathGym").onclick = () =>
      document.getElementById("mathGymModal").classList.add("hidden");

    // 國語與數學道館分頁切換
    ["a", "b", "c"].forEach((t) => {
      document.getElementById(`chTab_${t}`).onclick = () => {
        SFX.playClick();
        switchChineseTier(t);
      };
      document.getElementById(`maTab_${t}`).onclick = () => {
        SFX.playClick();
        switchMathTier(t);
      };
    });

    // 下方快捷按鈕
    document.getElementById("btnQuickChineseGym").onclick = () => openChineseGym("a");
    document.getElementById("btnQuickMathGym").onclick = () => openMathGym("a");
    document.getElementById("btnQuickShop").onclick = () => {
      healAllParty(false);
      openMenuModal("shop");
    };
    document.getElementById("btnContextInteract").onclick = () => triggerObjectInteraction();
    document.getElementById("btnQuickBag").onclick = () => openMenuModal("bag");
    document.getElementById("btnQuickParty").onclick = () => openMenuModal("party");
    document.getElementById("btnQuickWorldMap").onclick = () => openMenuModal("map");
    document.getElementById("btnToggleBike").onclick = () => {
      if (!state.ownedBicycle) return;
      state.ridingBicycle = !state.ridingBicycle;
      SFX.playClick();
      saveGame();
      updateAllHUD();
    };

    // 對戰主指令按鈕
    document.getElementById("battleMainCommands").querySelectorAll("button[data-cmd]").forEach((btn) => {
      btn.onclick = () => {
        if (!currentBattle || currentBattle.busy) return;
        const cmd = btn.getAttribute("data-cmd");
        if (cmd === "run") {
          SFX.playClick();
          showToast("💨 你安全地逃離了野生寶可夢對戰！");
          closeBattle();
        } else {
          showBattleSubMenu(cmd);
        }
      };
    });

    // 觸控十字鍵
    const dpadMap = {
      dpadUp: "north",
      dpadDown: "south",
      dpadLeft: "west",
      dpadRight: "east"
    };
    Object.entries(dpadMap).forEach(([id, dir]) => {
      const b = document.getElementById(id);
      if (b) {
        b.onclick = () => movePlayer(dir);
      }
    });

    // 點擊地圖 Canvas 直接互動或移動
    overworldCanvas.addEventListener("click", (e) => {
      if (isAnyModalOpen()) return;
      const rect = overworldCanvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * overworldCanvas.width + camX;
      const clickY = ((e.clientY - rect.top) / rect.height) * overworldCanvas.height + camY;
      const gx = Math.floor(clickX / TILE_SIZE);
      const gy = Math.floor(clickY / TILE_SIZE);
      const reg = getCurrentRegion();

      // 若點擊在建築物、門、寶箱或 NPC 上，直接觸發或靠近
      for (const obj of reg.objects || []) {
        const ow = obj.width || 1;
        const oh = obj.height || 1;
        if (gx >= obj.x && gx < obj.x + ow && gy >= obj.y && gy < obj.y + oh) {
          if (obj.kind === "building") {
            const door = (reg.objects || []).find(
              (d) => d.kind === "door" && d.x >= obj.x && d.x < obj.x + ow
            );
            if (door) {
              triggerObjectInteraction(door);
              return;
            }
          }
          if (["door", "chest", "npc", "sign", "waystone"].includes(obj.kind)) {
            triggerObjectInteraction(obj);
            return;
          }
        }
      }

      // 否則朝點擊方向移動一格
      const dx = gx - state.x;
      const dy = gy - state.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        movePlayer(dx > 0 ? "east" : "west");
      } else if (dy !== 0) {
        movePlayer(dy > 0 ? "south" : "north");
      }
    });

    // 鍵盤 WASD / 方向鍵 / E / Space / ESC
    window.addEventListener("keydown", (e) => {
      if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (!document.getElementById("menuModal").classList.contains("hidden")) {
          document.getElementById("menuModal").classList.add("hidden");
          return;
        }
        if (!document.getElementById("chineseGymModal").classList.contains("hidden")) {
          document.getElementById("chineseGymModal").classList.add("hidden");
          return;
        }
        if (!document.getElementById("mathGymModal").classList.contains("hidden")) {
          document.getElementById("mathGymModal").classList.add("hidden");
          return;
        }
        startMenu.style.display = startMenu.style.display === "none" ? "grid" : "none";
        return;
      }

      if (isAnyModalOpen()) {
        if (["e", "E", " ", "Enter"].includes(e.key) && !document.getElementById("menuModal").classList.contains("hidden")) {
          // 若為一般對話視窗可按 E 關閉
        }
        return;
      }

      const keyDir = {
        ArrowUp: "north",
        w: "north",
        W: "north",
        ArrowDown: "south",
        s: "south",
        S: "south",
        ArrowLeft: "west",
        a: "west",
        A: "west",
        ArrowRight: "east",
        d: "east",
        D: "east"
      }[e.key];

      if (keyDir) {
        e.preventDefault();
        movePlayer(keyDir);
      } else if (["e", "E", " "].includes(e.key)) {
        e.preventDefault();
        triggerObjectInteraction();
      }
    });
  }

  // 啟動遊戲
  bindEvents();
  if (!state.initialized || !state.party || state.party.length === 0) {
    showStarterModal();
  } else {
    updateAllHUD();
  }
  requestAnimationFrame(renderMainLoop);
})();
