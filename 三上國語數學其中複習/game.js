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
  // 每次正式發布若存檔格式或遊戲規則有重大變更，就提高版本號。
  // 不讀取舊版本，避免同一網址在平板上沿用上一版角色進度。
  const SAVE_KEY = "G3_POKEMON_WILLOW_VALLEY_V3";
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
    playLevelUp() {
      this.playTone(440, 0.08, "square", 0.09, 0);
      this.playTone(554.37, 0.08, "square", 0.09, 0.08);
      this.playTone(659.25, 0.08, "square", 0.09, 0.16);
      this.playTone(880, 0.28, "square", 0.11, 0.24);
    }
    playHatch() {
      this.playTone(523.25, 0.09, "triangle", 0.09, 0);
      this.playTone(659.25, 0.09, "triangle", 0.09, 0.09);
      this.playTone(783.99, 0.09, "triangle", 0.09, 0.18);
      this.playTone(1046.5, 0.12, "square", 0.10, 0.27);
      this.playTone(1318.5, 0.32, "square", 0.11, 0.39);
    }
    playGymComplete() {
      this.playTone(523.25, 0.10, "square", 0.09, 0);
      this.playTone(659.25, 0.10, "square", 0.09, 0.10);
      this.playTone(783.99, 0.10, "square", 0.09, 0.20);
      this.playTone(1046.5, 0.14, "square", 0.10, 0.30);
      this.playTone(783.99, 0.10, "square", 0.09, 0.44);
      this.playTone(1046.5, 0.36, "square", 0.12, 0.54);
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
  // 2. 圖片資源載入 & Infinite Pokémon (skills-v0.2.0) 像素合成獸圖像引擎
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

  // 寶可夢圖像：參考 The Spriters Resource《寶可夢 金／銀》(Game Boy Color) 像素圖，
  // 使用 PokeAPI 收錄的第二世代金版透明背景精靈圖（正面 / 背面）
  const GEN2_SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ii";
  function getPortraitUrl(id4) {
    const id = parseInt(id4, 10) || 25;
    return getGen2SpriteUrl(id, false);
  }
  function getGen2SpriteUrl(id, back = false) {
    return back
      ? `${GEN2_SPRITE_BASE}/gold/transparent/back/${id}.png`
      : `${GEN2_SPRITE_BASE}/gold/transparent/${id}.png`;
  }
  function getStaticSpriteUrl(id, back = false) {
    return back
      ? `${GEN2_SPRITE_BASE}/crystal/transparent/back/${id}.png`
      : `${GEN2_SPRITE_BASE}/crystal/transparent/${id}.png`;
  }
  function getAnimSpriteUrl(id, back = false) {
    return getGen2SpriteUrl(id, back);
  }
  function getSpriteUrl(id) {
    return getGen2SpriteUrl(id || 25, false);
  }

  // 100% 移植自 Shellishack/infinite-pokemon (skills-v0.2.0) game/client/content-art.ts
  const PIXEL_ART_CACHE = new Map();
  function generatePixelCreatureDataUrl(art, back = false) {
    if (!art) return "";
    const key = `${JSON.stringify(art)}:${back ? "back" : "front"}`;
    if (PIXEL_ART_CACHE.has(key)) return PIXEL_ART_CACHE.get(key);

    const p = art.primary || "#6fa66a";
    const a = art.accent || "#f5cf6b";
    const o = "#263038";
    const belly = "#f4f2e6";
    const rects = [];
    const r = (x, y, w, h, fill) =>
      rects.push(`<rect x="${back ? 16 - x - w : x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);

    r(4, 14, 8, 1, "rgba(24,32,36,0.22)");
    if (art.wings) {
      r(1, 5, 3, 5, a);
      r(12, 5, 3, 5, a);
    }
    if (art.horns) {
      r(4, 1, 2, 2, a);
      r(10, 1, 2, 2, a);
    }

    const form = art.form || "quadruped";
    if (form === "bird") {
      r(4, 4, 8, 7, p);
      r(5, 2, 6, 4, p);
      r(11, 4, 3, 2, a);
      r(5, 11, 2, 3, a);
      r(9, 11, 2, 3, a);
    } else if (form === "fish") {
      r(3, 5, 9, 6, p);
      r(12, 4, 3, 8, a);
      r(6, 3, 4, 2, a);
      r(5, 8, 5, 2, belly);
    } else if (form === "serpent") {
      r(3, 3, 5, 4, p);
      r(6, 6, 5, 4, p);
      r(4, 9, 6, 4, p);
      r(9, 11, 4, 2, a);
    } else if (form === "golem") {
      r(3, 3, 10, 9, p);
      r(2, 6, 2, 5, a);
      r(12, 6, 2, 5, a);
      r(4, 12, 3, 2, o);
      r(9, 12, 3, 2, o);
    } else if (form === "sprite") {
      r(5, 3, 6, 7, p);
      r(4, 5, 8, 4, p);
      r(6, 10, 4, 3, a);
    } else {
      // quadruped
      r(4, 5, 8, 6, p);
      r(3, 3, 5, 4, p);
      r(5, 8, 5, 3, belly);
      r(4, 11, 2, 3, p);
      r(10, 11, 2, 3, p);
      r(12, 6, 2, 3, a);
    }

    if (art.pattern === "stripes") {
      r(6, 5, 1, 4, a);
      r(9, 5, 1, 4, a);
    } else if (art.pattern === "spots") {
      r(6, 6, 2, 2, a);
      r(9, 8, 2, 2, a);
    } else if (art.pattern === "crest") {
      r(6, 1, 4, 2, a);
    }

    if (!back) {
      r(5, 4, 1, 2, o);
      r(9, 4, 1, 2, o);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join("")}</svg>`;
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    PIXEL_ART_CACHE.set(key, url);
    return url;
  }

  function getDefaultArtForPokemon(catOrPoke) {
    if (catOrPoke.art) return catOrPoke.art;
    const typeStr = String(catOrPoke.typeEn || catOrPoke.type || "NORMAL").toUpperCase();
    const formMap = {
      ELECTRIC: "sprite",
      FIRE: "bird",
      WATER: "fish",
      GRASS: "quadruped",
      ROCK: "golem",
      STEEL: "golem",
      DRAGON: "serpent",
      FLYING: "bird",
      BUG: "sprite",
      FAIRY: "quadruped",
      PSYCHIC: "sprite"
    };
    return {
      form: formMap[typeStr] || "quadruped",
      primary: catOrPoke.typeColor || "#6fa66a",
      accent: "#fde047",
      pattern: (catOrPoke.id || 1) % 3 === 0 ? "crest" : (catOrPoke.id || 1) % 2 === 0 ? "stripes" : "spots",
      horns: Boolean((catOrPoke.id || 1) % 2 === 0),
      wings: typeStr.includes("FLY") || typeStr.includes("DRAGON") || typeStr.includes("FIRE")
    };
  }

  // 依 52Poke 的最低等級規則進化；不再使用合成或突破石改變物種。
  function tryLevelEvolution(poke) {
    if (!poke || !DATA.evolutionRules) return null;
    const rule = DATA.evolutionRules[String(poke.id)];
    if (!rule || poke.level < rule.level) return null;
    const target = DATA.pokemonCatalog.find((p) => p.id === rule.to);
    if (!target) return null;
    const previousName = poke.name;
    poke.id = target.id;
    poke.id4 = target.id4;
    poke.speciesKey = target.speciesKey || `sp_${target.id}`;
    poke.name = target.name;
    poke.enName = target.enName;
    poke.type = target.type;
    poke.typeEn = target.typeEn || poke.typeEn;
    poke.typeColor = target.typeColor || poke.typeColor;
    poke.basicMove = target.basicMove || poke.basicMove;
    poke.specialMove = target.move || poke.specialMove;
    poke.baseSpeciesId = target.id;
    poke.maxHp += 8;
    poke.hp = poke.maxHp;
    poke.atk += 4;
    poke.def += 4;
    addJournalEntry(`✨ 【${previousName}】達到 Lv.${poke.level}，進化成【${poke.name}】！`);
    return { previousName, name: poke.name, level: poke.level };
  }

  function getPokemonDisplayUrl(poke, mode = "portrait") {
    if (!poke) return getGen2SpriteUrl(25, false);
    const id = poke.baseSpeciesId || poke.id || 25;
    return getGen2SpriteUrl(id, mode === "back");
  }

  function getPokemonFallbackUrl(poke, mode = "portrait") {
    if (!poke) return getStaticSpriteUrl(25, false);
    const id = poke.baseSpeciesId || poke.id || 25;
    return getStaticSpriteUrl(id, mode === "back");
  }

  // --------------------------------------------------------------------------
  // 3. 玩家存檔、寶可夢特性、經驗值升級 (Level-Up) 與突破進化系統
  // --------------------------------------------------------------------------
  let selectedStarterId = 25; // 預設皮卡丘 (25: 皮卡丘, 6: 噴火龍, 1: 妙蛙種子)

  const TRAIT_KEYS = Object.keys(DATA.traits || {
    hearty: 1, bold: 1, gentle: 1, curious: 1, swift: 1, elusive: 1, sturdy: 1, radiant: 1
  });

  function pickTraitsForSeed(seedNum, presetTraits = null) {
    if (Array.isArray(presetTraits) && presetTraits.length > 0) {
      return presetTraits.slice(0, 2);
    }
    const t1 = TRAIT_KEYS[Math.abs(seedNum) % TRAIT_KEYS.length];
    const t2 = TRAIT_KEYS[Math.abs(seedNum * 7 + 3) % TRAIT_KEYS.length];
    return t1 === t2 ? [t1] : [t1, t2];
  }

  function formatTraitBadges(traits) {
    if (!Array.isArray(traits) || traits.length === 0) return "";
    return traits
      .map((tKey) => {
        const tObj = DATA.traits && DATA.traits[tKey];
        const label = tObj ? tObj.name.split(" ")[0] : tKey;
        const tip = tObj ? tObj.desc : "";
        return `<span class="trait-badge" title="${tip}">✦${label}</span>`;
      })
      .join("");
  }

  function getNextLevelExp(lv = 1) {
    return 20 + Math.max(0, (lv || 1) - 1) * 5;
  }

  function ensurePokemonFields(p) {
    if (!p) return p;
    if (!p.uid) p.uid = "pk_" + Date.now() + "_" + Math.floor(Math.random() * 99999);
    if (typeof p.xp !== "number") p.xp = typeof p.exp === "number" ? p.exp : 0;
    if (typeof p.xpToNext !== "number") p.xpToNext = 20;
    if (!Array.isArray(p.traits) || p.traits.length === 0) {
      p.traits = pickTraitsForSeed((p.id || 25) + (p.level || 1));
    }
    if (typeof p.generation !== "number") p.generation = p.isHybrid ? 1 : 0;
    if (typeof p.breakthroughStage !== "number") p.breakthroughStage = 0;
    if (typeof p.breedAfterStep !== "number") p.breedAfterStep = 0;
    if (!p.art) p.art = getDefaultArtForPokemon(p);
    return p;
  }

  function createPokemonInstance(catId, customLv = null, isStarter = false) {
    const cat = DATA.pokemonCatalog.find((p) => p.id === catId || p.speciesKey === catId) || DATA.pokemonCatalog[0];
    const lv = customLv !== null ? customLv : cat.minLv || 1;
    const traits = pickTraitsForSeed((cat.id || 25) * 13 + lv, cat.traits);
    const hasHearty = traits.includes("hearty");
    const hasSturdy = traits.includes("sturdy");
    const hasRadiant = traits.includes("radiant");
    const traitHp = (hasHearty ? 8 : 0) + (hasSturdy ? 4 : 0);
    const traitAtk = hasRadiant ? 2 : 0;
    const traitDef = (hasSturdy ? 3 : 0) + (hasRadiant ? 2 : 0);

    // 主角初始寶可夢剛領取時為 Lv.1（未受訓初階狀態），必須先去國語/數學道館訓練才能打贏野外怪獸！
    if (isStarter) {
      const startHp = cat.baseHp + Math.round(traitHp * 0.5);
      return ensurePokemonFields({
        uid: "pk_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
        id: cat.id,
        id4: cat.id4,
        speciesKey: cat.speciesKey || `sp_${cat.id}`,
        name: cat.name,
        enName: cat.enName,
        type: cat.type,
        typeEn: cat.typeEn || "NORMAL",
        typeColor: cat.typeColor || "#f3d363",
        level: 1,
        xp: 0,
        xpToNext: 20,
        maxHp: startHp,
        hp: startHp,
        atk: cat.baseAtk + traitAtk,
        def: cat.baseDef + traitDef,
        atkTrained: 0,
        defTrained: 0,
        traits,
        generation: cat.generation || 0,
        isHybrid: Boolean(cat.isHybrid),
        breakthroughStage: 0,
        breedAfterStep: 0,
        art: cat.art || getDefaultArtForPokemon(cat),
        basicMove: cat.basicMove || "撞擊",
        specialMove: cat.move || "十萬伏特",
        maxAttackPp: 35,
        attackPp: 35,
        maxSpecialPp: cat.specialPp || 25,
        specialPp: cat.specialPp || 25
      });
    }

    // 野生或收服後的寶可夢依等級計算加上玩家目前的道館加成與特性加成
    const scale = 1 + Math.max(0, lv - (cat.minLv || 1)) * 0.08;
    const bonusAtk = state ? Math.round((state.atkBonus || 0) * 0.6) : 0;
    const bonusDef = state ? Math.round((state.defBonus || 0) * 0.6) : 0;
    const maxHp = Math.round(cat.baseHp * scale) + bonusDef * 2 + traitHp;
    return ensurePokemonFields({
      uid: "pk_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
      id: cat.id,
      id4: cat.id4,
      speciesKey: cat.speciesKey || `sp_${cat.id}`,
      name: cat.name,
      enName: cat.enName,
      type: cat.type,
      typeEn: cat.typeEn || "NORMAL",
      typeColor: cat.typeColor || "#6fa66a",
      level: lv,
      xp: 0,
      xpToNext: 20,
      maxHp: maxHp,
      hp: maxHp,
      atk: Math.round(cat.baseAtk * scale) + bonusAtk + traitAtk,
      def: Math.round(cat.baseDef * scale) + bonusDef + traitDef,
      atkTrained: bonusAtk,
      defTrained: bonusDef,
      traits,
      generation: cat.generation || 0,
      isHybrid: Boolean(cat.isHybrid),
      breakthroughStage: 0,
      breedAfterStep: 0,
      art: cat.art || getDefaultArtForPokemon(cat),
      basicMove: cat.basicMove || "撞擊",
      specialMove: cat.move || "特殊招式",
      maxAttackPp: 35,
      attackPp: 35,
      maxSpecialPp: cat.specialPp || 20,
      specialPp: cat.specialPp || 20
    });
  }

  function addJournalEntry(text) {
    if (!state.journal) state.journal = [];
    state.journal.unshift(`${formatNowTime().split(" ")[1] || ""} ${text}`);
    state.journal = state.journal.slice(0, 20);
  }

  function getCoinMultiplier() {
    const amuletCount = (state && state.items && state.items["amulet-coin"]) || 0;
    return 1 + amuletCount * 0.5;
  }

  function getExpMultiplier(poke) {
    const hasCurious = poke && Array.isArray(poke.traits) && poke.traits.includes("curious");
    const luckyEggs = (state && state.items && state.items["lucky-egg"]) || 0;
    return (hasCurious ? 1.25 : 1.0) + luckyEggs * 0.25;
  }

  // 為商店與背包道具產生精緻像素/向量 SVG 圖示（當離線或外部圖片載入失敗時亦可呈現高質感圖示）
  function getItemFallbackSvgUrl(it) {
    const id = (it && it.id) || "poke-ball";
    let bodySvg = "";
    if (id === "rare-candy" || id === "exp-candy-s" || id === "exp-candy-l") {
      const c1 = id === "exp-candy-l" ? "#f472b6" : id === "exp-candy-s" ? "#c084fc" : "#60a5fa";
      const c2 = id === "exp-candy-l" ? "#db2777" : id === "exp-candy-s" ? "#7e22ce" : "#2563eb";
      bodySvg = `
        <polygon points="6,20 14,14 14,26" fill="${c1}" stroke="#1e293b" stroke-width="2"/>
        <polygon points="34,12 26,18 26,6" fill="${c1}" stroke="#1e293b" stroke-width="2"/>
        <circle cx="20" cy="16" r="8" fill="${c1}" stroke="#1e293b" stroke-width="2"/>
        <path d="M15,13 Q20,10 24,15" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <circle cx="22" cy="18" r="2.5" fill="${c2}"/>
      `;
    } else if (id === "lucky-egg") {
      bodySvg = `
        <ellipse cx="20" cy="17" rx="9" ry="11.5" fill="#f8fafc" stroke="#1e293b" stroke-width="2"/>
        <ellipse cx="18" cy="14" rx="5" ry="7" fill="#ffffff"/>
        <path d="M14,21 Q20,25 26,20" stroke="#cbd5e1" stroke-width="2" fill="none"/>
      `;
    } else if (id === "amulet-coin") {
      bodySvg = `
        <path d="M15,10 Q20,3 25,10" stroke="#ef4444" stroke-width="2.2" fill="none"/>
        <rect x="13" y="10" width="14" height="17" rx="7" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
        <rect x="16" y="13" width="4" height="8" rx="2" fill="#fef08a"/>
        <circle cx="20" cy="13" r="1.6" fill="#78350f"/>
      `;
    } else if (id === "sweet-honey") {
      bodySvg = `
        <rect x="11" y="11" width="18" height="16" rx="5" fill="#f59e0b" stroke="#1e293b" stroke-width="2"/>
        <ellipse cx="20" cy="10" rx="8" ry="3.5" fill="#fef08a" stroke="#1e293b" stroke-width="2"/>
        <ellipse cx="20" cy="10" rx="5" ry="2" fill="#93c5fd"/>
        <path d="M14,16 Q20,19 26,16" stroke="#fde047" stroke-width="2.5" fill="none"/>
      `;
    } else if (id === "evo-stone") {
      bodySvg = `
        <polygon points="20,4 29,12 26,26 14,28 11,14" fill="#bef264" stroke="#1e293b" stroke-width="2"/>
        <polygon points="20,7 26,13 20,24 15,15" fill="#ecfccb"/>
        <circle cx="18" cy="13" r="2" fill="#ffffff"/>
      `;
    } else if (id === "master-ball" || id === "poke-ball" || id === "great-ball" || id === "ultra-ball") {
      const topFill = id === "master-ball" ? "#9333ea" : id === "great-ball" ? "#2563eb" : id === "ultra-ball" ? "#334155" : "#ef4444";
      const accent = id === "master-ball" ? "#f472b6" : id === "great-ball" ? "#ef4444" : id === "ultra-ball" ? "#facc15" : "#ef4444";
      bodySvg = `
        <circle cx="20" cy="16" r="11" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>
        <path d="M9,16 A11,11 0 0,1 31,16 Z" fill="${topFill}" stroke="#1e293b" stroke-width="2"/>
        <circle cx="13" cy="10" r="2.5" fill="${accent}"/>
        <circle cx="27" cy="10" r="2.5" fill="${accent}"/>
        <line x1="9" y1="16" x2="31" y2="16" stroke="#1e293b" stroke-width="2.5"/>
        <circle cx="20" cy="16" r="3.5" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>
      `;
    } else {
      bodySvg = `
        <rect x="13" y="7" width="14" height="20" rx="4" fill="${(it && it.color) || "#a855f7"}" stroke="#1e293b" stroke-width="2"/>
        <rect x="16" y="4" width="8" height="4" rx="1" fill="#e2e8f0" stroke="#1e293b" stroke-width="1.8"/>
        <rect x="16" y="12" width="8" height="8" rx="2" fill="#ffffff" opacity="0.85"/>
      `;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34">${bodySvg}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 寶可夢獲得經驗值與升級邏輯 (參考 infinite-pokemon world.ts + 幸運蛋倍率 + 階段突破)
  function gainPokemonExp(poke, rawExp, showBattleBanner = false) {
    if (!poke) return { leveledUp: false, levelsGained: 0 };
    ensurePokemonFields(poke);
    const mult = getExpMultiplier(poke);
    const expGain = Math.max(1, Math.round(rawExp * mult));
    poke.xp = (poke.xp || 0) + expGain;

    let levelsGained = 0;
    let totalHpGain = 0;
    let totalAtkGain = 0;
    let totalDefGain = 0;
    let breakthroughMsg = "";

    while (poke.xp >= (poke.xpToNext || 20)) {
      poke.xp -= poke.xpToNext || 20;
      poke.level += 1;
      levelsGained += 1;

      const hpUp = 5 + (poke.isHybrid ? 2 : 0);
      const atkUp = 3 + (poke.isHybrid ? 1 : 0);
      const defUp = 3 + (poke.isHybrid ? 1 : 0);

      poke.maxHp += hpUp;
      poke.hp = Math.min(poke.maxHp, poke.hp + hpUp + 4);
      poke.atk += atkUp;
      poke.def += defUp;

      totalHpGain += hpUp;
      totalAtkGain += atkUp;
      totalDefGain += defUp;

      const evolved = tryLevelEvolution(poke);
      if (evolved) breakthroughMsg = `✨ ${evolved.previousName} → ${evolved.name}！達到官方等級進化條件。`;
    }

    if (levelsGained > 0) {
      SFX.playLevelUp();
      addJournalEntry(`⬆️ 【${poke.name}】升上了 Lv.${poke.level}！（HP+${totalHpGain} · ATK+${totalAtkGain} · DEF+${totalDefGain}）`);
      if (showBattleBanner) {
        const banner = document.getElementById("battleLevelUpBanner");
        if (banner) {
          banner.style.display = "block";
          banner.innerHTML = `
            <div style="font-size:2.6cqw;font-weight:900;">🎉 LEVEL UP！${poke.name} 升至 Lv.${poke.level}！</div>
            <div style="font-size:2cqw;font-weight:800;margin-top:0.3cqw;">
              ❤️ 最大HP +${totalHpGain} ｜ ⚔️ 攻擊力 +${totalAtkGain} ｜ 🛡️ 防禦力 +${totalDefGain}
            </div>
            ${breakthroughMsg ? `<div style="font-size:1.85cqw;color:#7e22ce;font-weight:900;margin-top:0.3cqw;">${breakthroughMsg}</div>` : ""}
          `;
          setTimeout(() => {
            banner.style.display = "none";
          }, 3000);
        }
      }
    }

    return {
      leveledUp: levelsGained > 0,
      levelsGained,
      expGain,
      totalHpGain,
      totalAtkGain,
      totalDefGain,
      breakthroughMsg
    };
  }

  const SAVE_SLOT_KEYS = [
    "G3_POKEMON_WILLOW_V3_SLOT_1",
    "G3_POKEMON_WILLOW_V3_SLOT_2",
    "G3_POKEMON_WILLOW_V3_SLOT_3"
  ];

  function getDefaultState() {
    return {
      initialized: false,
      trainerName: "小智",
      regionId: "0,0", // 預設在 柳溪 (Willowbrook)
      x: 16,
      y: 12,
      facing: "south",
      steps: 0,
      activeIndex: 0,
      party: [],
      storage: [],
      caughtIds: [],
      customSpecies: [],      // 培育屋合成出的新寶可夢物種
      egg: null,              // 培育屋正在孵化的合成蛋 { parentNames, stepsRemaining, childSpecies }
      defeatedTrainers: [],   // 已擊敗的路線訓練家
      defeatedGuardians: [],  // 已擊敗的路標石守護者
      journal: ["歡迎來到若葉鎮！先前往國語與數學道館特訓，讓寶可夢依照等級進化！"],
      visitedRegions: ["0,0"],
      collectedChests: [],    // 已開啟的寶箱 ID
      coins: 150,             // 初始金幣 ₽150
      shopPurchased: {},      // 記錄各商店道具今日已購買次數
      items: {
        "rare-candy": 0,
        "lucky-egg": 0,
        "amulet-coin": 0,
        "sweet-honey": 0,
        "evo-stone": 0,
        "master-ball": 0,
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
        "guard-charm": 0,
        "exp-candy-s": 2,     // 初始贈送 2 顆經驗糖果 S 讓學生體驗升級！
        "exp-candy-l": 0
      },
      ownedBicycle: false,
      ridingBicycle: false,
      repelSteps: 0,
      atkBonus: 0,
      defBonus: 0,
      chineseScore: 0,
      mathScore: 0,
      completedQuestions: [],
      badges: { chinese: false, math: false },
      lastSavedAt: "尚未存檔"
    };
  }

  let state = loadGame();

  function loadGame(customKey = SAVE_KEY) {
    try {
      const raw = localStorage.getItem(customKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.initialized && Array.isArray(parsed.party) && parsed.party.length > 0) {
          const merged = Object.assign(getDefaultState(), parsed);
          merged.items = Object.assign(getDefaultState().items, parsed.items || {});
          merged.shopPurchased = Object.assign({}, parsed.shopPurchased || {});
          merged.party = (merged.party || []).map(ensurePokemonFields);
          merged.storage = (merged.storage || []).map(ensurePokemonFields);
          return merged;
        }
      }
    } catch (e) {}
    return getDefaultState();
  }

  function formatNowTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function saveGame(showManualToast = false) {
    try {
      state.lastSavedAt = formatNowTime();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      const badge = document.getElementById("saveStatusBadge");
      if (badge) {
        const shortTime = state.lastSavedAt.split(" ")[1] || state.lastSavedAt;
        badge.textContent = `💾 已存檔 ${shortTime}`;
      }
      if (showManualToast) {
        SFX.playHeal();
        showToast(`💾 進度已成功儲存！（${state.lastSavedAt}）`);
      }
    } catch (e) {}
  }

  function saveToSlot(slotIdx) {
    const key = SAVE_SLOT_KEYS[slotIdx];
    if (!key) return;
    try {
      state.lastSavedAt = formatNowTime();
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      SFX.playHeal();
      updateAllHUD();
      showToast(`💾 已將【${state.trainerName}】的冒險進度存入「存檔槽 ${slotIdx + 1}」！`);
    } catch (e) {}
  }

  function loadFromSlot(slotIdx) {
    const key = SAVE_SLOT_KEYS[slotIdx];
    if (!key) return false;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.initialized && Array.isArray(parsed.party) && parsed.party.length > 0) {
        state = Object.assign(getDefaultState(), parsed);
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        camX = state.x * TILE_SIZE;
        camY = state.y * TILE_SIZE;
        SFX.playHeal();
        updateAllHUD();
        showToast(`📂 已成功讀取「存檔槽 ${slotIdx + 1}」— 訓練家【${state.trainerName}】的進度！`);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function deleteSlot(slotIdx) {
    const key = SAVE_SLOT_KEYS[slotIdx];
    if (!key) return;
    try {
      localStorage.removeItem(key);
      SFX.playClick();
      showToast(`🗑️ 已清除「存檔槽 ${slotIdx + 1}」的紀錄。`);
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

    // 若平板/觸控點選了地面目標點，繪製目標引導光圈
    if (walkTarget && walkTarget.regionId === state.regionId) {
      const tx = walkTarget.x * TILE_SIZE + 8 - sx;
      const ty = walkTarget.y * TILE_SIZE + 8 - sy;
      const pulse = 5 + Math.sin(animTick * 0.25) * 2;
      ctx.save();
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(250, 204, 21, 0.32)";
      ctx.fill();
      ctx.restore();
    }

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
  // 6. 角色移動、平板觸控尋路、地圖切換、碰撞與互動系統 (Move & Interact)
  // --------------------------------------------------------------------------
  const DIR_DELTAS = {
    north: [0, -1],
    south: [0, 1],
    west: [-1, 0],
    east: [1, 0]
  };

  let walkTarget = null;
  let autoWalkInterval = null;

  function stopAutoWalk() {
    walkTarget = null;
    if (autoWalkInterval) {
      clearInterval(autoWalkInterval);
      autoWalkInterval = null;
    }
  }

  function startAutoWalkTo(gx, gy, interactObj = null) {
    if (isAnyModalOpen()) return;
    walkTarget = {
      regionId: state.regionId,
      x: Math.max(-1, Math.min(MAP_COLS, gx)),
      y: Math.max(-1, Math.min(MAP_ROWS, gy)),
      interactObj
    };
    if (autoWalkInterval) clearInterval(autoWalkInterval);
    stepTowardWalkTarget();
    if (walkTarget) {
      autoWalkInterval = setInterval(stepTowardWalkTarget, state.ridingBicycle ? 95 : 135);
    }
  }

  function stepTowardWalkTarget() {
    if (!walkTarget || isAnyModalOpen() || walkTarget.regionId !== state.regionId) {
      stopAutoWalk();
      return;
    }
    const dx = walkTarget.x - state.x;
    const dy = walkTarget.y - state.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    // 若已抵達目標點，或已走到目標互動物件旁邊
    if (dist === 0 || (walkTarget.interactObj && dist <= 1)) {
      const obj = walkTarget.interactObj;
      if (dx !== 0 || dy !== 0) {
        state.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "east" : "west") : (dy > 0 ? "south" : "north");
      }
      stopAutoWalk();
      if (obj) {
        triggerObjectInteraction(obj);
      }
      updateContextBar();
      return;
    }

    const reg = getCurrentRegion();
    const primaryDir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "east" : "west") : (dy > 0 ? "south" : "north");
    const secondaryDir =
      Math.abs(dx) >= Math.abs(dy)
        ? dy !== 0
          ? dy > 0
            ? "south"
            : "north"
          : null
        : dx !== 0
        ? dx > 0
          ? "east"
          : "west"
        : null;

    const canStep = (dir) => {
      if (!dir) return false;
      const [sx, sy] = DIR_DELTAS[dir];
      const nx = state.x + sx;
      const ny = state.y + sy;
      if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) return true; // 出口
      const isDoor = (reg.objects || []).some((o) => o.kind === "door" && o.x === nx && o.y === ny);
      if (isDoor) return true;
      return !isSolidTile(reg, nx, ny);
    };

    const prevX = state.x;
    const prevY = state.y;

    if (canStep(primaryDir)) {
      movePlayer(primaryDir, true);
    } else if (secondaryDir && canStep(secondaryDir)) {
      movePlayer(secondaryDir, true);
    } else {
      // 若被障礙物擋住但目標是互動物件且距離 <= 2，直接觸發互動
      if (walkTarget && walkTarget.interactObj && dist <= 2) {
        const obj = walkTarget.interactObj;
        stopAutoWalk();
        triggerObjectInteraction(obj);
        return;
      }
      stopAutoWalk();
      return;
    }

    if (state.x === prevX && state.y === prevY) {
      stopAutoWalk();
    }
  }

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

  function movePlayer(dir, fromAutoWalk = false) {
    if (isAnyModalOpen()) {
      stopAutoWalk();
      return;
    }
    if (!fromAutoWalk) {
      stopAutoWalk();
    }
    state.facing = dir;
    const [dx, dy] = DIR_DELTAS[dir] || [0, 0];
    const nx = state.x + dx;
    const ny = state.y + dy;
    const reg = getCurrentRegion();

    // 檢查是否走出地圖邊界（切換至相鄰的 5 大地圖）
    if (nx < 0 && reg.exits && reg.exits.west) {
      stopAutoWalk();
      travelToRegion(reg.exits.west.target, reg.exits.west.x, reg.exits.west.y);
      return;
    }
    if (nx >= MAP_COLS && reg.exits && reg.exits.east) {
      stopAutoWalk();
      travelToRegion(reg.exits.east.target, reg.exits.east.x, reg.exits.east.y);
      return;
    }
    if (ny < 0 && reg.exits && reg.exits.north) {
      stopAutoWalk();
      travelToRegion(reg.exits.north.target, reg.exits.north.x, reg.exits.north.y);
      return;
    }
    if (ny >= MAP_ROWS && reg.exits && reg.exits.south) {
      stopAutoWalk();
      travelToRegion(reg.exits.south.target, reg.exits.south.x, reg.exits.south.y);
      return;
    }

    // 檢查是否踏入建築大門
    const doorObj = (reg.objects || []).find((o) => o.kind === "door" && o.x === nx && o.y === ny);
    if (doorObj) {
      stopAutoWalk();
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
    state.steps = (state.steps || 0) + 1;
    SFX.playStep();

    if (state.repelSteps > 0) {
      state.repelSteps--;
    }

    // 培育屋合成蛋步數孵化推進 (參考 infinite-pokemon world.ts stepEgg)
    if (stepEggHatch()) {
      saveGame();
      updateAllHUD();
      return;
    }

    // 檢查是否踏入深草叢 (tile === 3) 觸發野生寶可夢遭遇戰
    const steppedTile = reg.tiles[ny * MAP_COLS + nx];
    if (steppedTile === 3 && state.repelSteps <= 0) {
      if (Math.random() < 0.24) {
        stopAutoWalk();
        startWildEncounter(reg.id);
      }
    }

    saveGame();
    updateAllHUD();
  }

  // --------------------------------------------------------------------------
  // 培育屋合成演算法與孵蛋系統 (參考 infinite-pokemon game/engine/content.ts)
  // --------------------------------------------------------------------------
  let nurserySelA = null;
  let nurserySelB = null;
  let nurseryCustomName = "";

  function buildSynthesizedSpecies(parentA, parentB, customName = "") {
    ensurePokemonFields(parentA);
    ensurePokemonFields(parentB);

    // 結合雙親中文名稱與英文名稱 (例如：皮卡丘 + 噴火龍 => 皮卡火龍)
    const nameA = parentA.name.replace(/·.*$/, "").trim();
    const nameB = parentB.name.replace(/·.*$/, "").trim();
    const prefix = nameA.slice(0, Math.max(1, Math.ceil(nameA.length / 2)));
    const suffix = nameB.slice(Math.floor(nameB.length / 2));
    const defaultZhName = (prefix + suffix === nameA || prefix + suffix === nameB)
      ? `${nameA.slice(0, 2)}${nameB.slice(-1)}獸`
      : `${prefix}${suffix}`;
    const finalName = (customName && customName.trim()) ? customName.trim() : defaultZhName;

    const enA = (parentA.enName || "Pika").slice(0, 4);
    const enB = (parentB.enName || "drake").slice(-4).toLowerCase();
    const enName = `${enA}${enB}`;

    // 雙屬性融合
    const typesArr = Array.from(
      new Set(
        [parentA.type, parentB.type]
          .join(" / ")
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ).slice(0, 2);
    const combinedType = typesArr.join(" / ") || "一般";

    // 繼承雙親特性 (最多 2 個) + 世代計算
    const combinedTraits = Array.from(
      new Set([...(parentA.traits || []), ...(parentB.traits || []), "radiant"])
    ).slice(0, 2);
    const generation = 1 + Math.max(parentA.generation || 0, parentB.generation || 0);

    // 結合雙親像素外型特徵 (form 來自親代 A，配色、翅膀、角、花紋融合雙親)
    const artA = parentA.art || getDefaultArtForPokemon(parentA);
    const artB = parentB.art || getDefaultArtForPokemon(parentB);
    const patterns = ["stripes", "spots", "crest"];
    const childArt = {
      form: artA.form || "quadruped",
      primary: artA.primary || parentA.typeColor || "#6fa66a",
      accent: artB.accent !== artA.primary ? (artB.primary || artB.accent || "#f5cf6b") : "#fde047",
      pattern: patterns[(generation + (parentA.level || 5) + (parentB.level || 5)) % patterns.length],
      horns: Boolean(artA.horns || artB.horns || generation >= 2),
      wings: Boolean(artA.wings || artB.wings || combinedType.includes("飛") || combinedType.includes("龍") || combinedType.includes("火"))
    };

    // 合成後代初始等級與繼承能力值加成
    const childLv = Math.max(5, Math.round(((parentA.level || 5) + (parentB.level || 5)) * 0.55));
    const inheritedHp = Math.round(((parentA.maxHp || 40) + (parentB.maxHp || 40)) * 0.58) + generation * 8;
    const inheritedAtk = Math.round(((parentA.atk || 15) + (parentB.atk || 15)) * 0.58) + generation * 4;
    const inheritedDef = Math.round(((parentA.def || 14) + (parentB.def || 14)) * 0.58) + generation * 4;

    const moveA = parentA.specialMove || "十萬伏特";
    const moveB = parentB.specialMove || "噴射火焰";
    const hybridMove = moveA === moveB ? `${moveA}・極` : `${moveA.slice(0, 2)}${moveB.slice(-2)}`;

    const hybridId = 1000 + ((state.customSpecies ? state.customSpecies.length : 0) + 1);
    return {
      id: hybridId,
      id4: String(hybridId).padStart(4, "0"),
      speciesKey: `hybrid-${parentA.speciesKey || parentA.id}-${parentB.speciesKey || parentB.id}-g${generation}`,
      name: finalName,
      enName,
      type: combinedType,
      typeEn: parentA.typeEn || "NORMAL",
      typeColor: childArt.primary,
      regionId: state.regionId || "0,0",
      minLv: childLv,
      baseHp: inheritedHp,
      baseAtk: inheritedAtk,
      baseDef: inheritedDef,
      move: hybridMove,
      basicMove: parentB.basicMove || parentA.basicMove || "神速撞擊",
      specialPp: 22,
      traits: combinedTraits,
      generation,
      isHybrid: true,
      customSprite: true,
      parentNames: [parentA.name, parentB.name],
      art: childArt,
      desc: `【第 ${generation} 代培育屋合成寶可夢】由親代【${parentA.name}】與【${parentB.name}】跨種合成誕生！兼備雙親的屬性、特性與道館修練潛能！`
    };
  }

  function hatchCurrentEgg() {
    if (!state.egg || !state.egg.childSpecies) return null;
    const sp = state.egg.childSpecies;
    if (!state.customSpecies) state.customSpecies = [];
    if (!state.customSpecies.some((c) => c.id === sp.id)) {
      state.customSpecies.push(sp);
    }
    if (!state.caughtIds.includes(sp.id)) {
      state.caughtIds.push(sp.id);
    }

    const childPoke = ensurePokemonFields({
      uid: "pk_hybrid_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
      id: sp.id,
      id4: sp.id4,
      speciesKey: sp.speciesKey,
      name: sp.name,
      enName: sp.enName,
      type: sp.type,
      typeEn: sp.typeEn,
      typeColor: sp.typeColor,
      level: sp.minLv || 5,
      xp: 0,
      xpToNext: 20,
      maxHp: sp.baseHp,
      hp: sp.baseHp,
      atk: sp.baseAtk,
      def: sp.baseDef,
      atkTrained: Math.round((state.atkBonus || 0) * 0.5),
      defTrained: Math.round((state.defBonus || 0) * 0.5),
      traits: sp.traits || ["radiant", "bold"],
      generation: sp.generation || 1,
      isHybrid: true,
      customSprite: true,
      parentNames: sp.parentNames || [],
      breakthroughStage: 1,
      breedAfterStep: (state.steps || 0) + 20,
      art: sp.art,
      basicMove: sp.basicMove || "神速撞擊",
      specialMove: sp.move || "雙重星爆",
      maxAttackPp: 35,
      attackPp: 35,
      maxSpecialPp: 22,
      specialPp: 22
    });

    const inParty = state.party.length < 6;
    if (inParty) {
      state.party.push(childPoke);
    } else {
      state.storage.push(childPoke);
    }

    state.egg = null;
    SFX.playHatch();
    addJournalEntry(`🐣 合成蛋孵化成功！誕生了第 ${childPoke.generation} 代合成獸【${childPoke.name} Lv.${childPoke.level}】！`);
    saveGame();
    updateAllHUD();
    return { childPoke, inParty };
  }

  function stepEggHatch() {
    if (!state.egg) return false;
    state.egg.stepsRemaining = Math.max(0, (state.egg.stepsRemaining || 1) - 1);
    if (state.egg.stepsRemaining > 0) return false;

    const res = hatchCurrentEgg();
    if (res && res.childPoke) {
      const p = res.childPoke;
      openDialogueModal(
        `🐣 喀嚓！培育屋合成蛋孵化了！`,
        `恭喜你！由【${(p.parentNames || []).join(" × ")}】合成的精靈蛋成功孵化出第 ${p.generation} 代合成寶可夢——\n\n✨ 【${p.name} · Lv.${p.level}】（${p.type}系）\n⚔️ 攻擊力：${p.atk} ｜ 🛡️ 防禦力：${p.def} ｜ ❤️ HP：${p.maxHp}\n🌟 融合絕招：${p.specialMove} ｜ 已加入你的${res.inParty ? "隨身出戰隊伍" : "電腦倉庫"}！`,
        [
          { label: "🐾 查看寶可夢隊伍", onClick: () => openMenuModal("party") },
          { label: "🧬 繼續合成新寶可夢", onClick: () => openMenuModal("nursery") }
        ]
      );
      return true;
    }
    return false;
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
      showToast("💡 請走到道館大門、培育屋飼育員、訓練家、寶箱或路標石旁再按 E / A 互動！");
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
      addJournalEntry(`🎁 開啟了【${obj.name}】，獲得 ₽${coinGain}！`);
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
      } else if (obj.role === "breeder") {
        openDialogueModal(obj.name, obj.text, [
          { label: "🧬 開啟培育屋（寶可夢跨種合成與孵蛋）", onClick: () => openMenuModal("nursery") }
        ]);
      } else if (obj.role === "trainer") {
        const trainerKey = `${state.regionId}:${obj.id}`;
        const alreadyWon = (state.defeatedTrainers || []).includes(trainerKey);
        openDialogueModal(
          `⚔️ ${obj.name} ${alreadyWon ? "（✅ 已擊敗過）" : "（🔥 路線訓練家挑戰）"}`,
          `${obj.text}\n\n💡 擊敗路線訓練家可獲得豐厚獎金（₽）、傷藥補給與大量戰鬥經驗值（EXP）！要與我進行寶可夢對戰嗎？`,
          [
            {
              label: `⚔️ 與 ${obj.name.split(" ")[0]} 進行訓練家對戰！`,
              onClick: () => startTrainerBattle(obj)
            }
          ]
        );
      } else {
        openDialogueModal(obj.name, obj.text);
      }
      return;
    }

    if (obj.kind === "waystone") {
      SFX.playClick();
      const guardianKey = `${state.regionId}:${obj.id}`;
      const defeated = (state.defeatedGuardians || []).includes(guardianKey);
      openDialogueModal(
        `🗿 ${obj.name || "古老路標石"} ${defeated ? "（👑 已擊敗守護者）" : "（⚡ 可召喚石碑守護者 BOSS）"}`,
        `${obj.text || getCurrentRegion().description}\n\n✨ 石碑中沉睡著本區域的【遠古守護者寶可夢】！挑戰成功可獲得高額金幣 ₽120+、經驗糖果 S 與大量升級經驗值 EXP！`,
        [
          {
            label: "⚡ 召喚並挑戰【石碑守護者 BOSS】！",
            onClick: () => startGuardianBattle(obj)
          }
        ]
      );
      return;
    }

    if (obj.kind === "sign" || obj.kind === "fence") {
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
      <p class="dialogue-text" style="font-size:20px;line-height:1.5;color:#1e293b;margin-bottom:16px;white-space:pre-line;">${text}</p>
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
      ensurePokemonFields(p);
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
  // 7. GBA 經典回合制對戰系統 (100% 參考 infinite-pokemon skills-v0.2.0)
  //    - 支援 3 種對戰模式：野生遭遇戰 (wild)、訓練家對戰 (trainer)、石碑守護者戰 (guardian)
  //    - 支援 18 屬性相剋倍率 (1.6x 效果絕佳 / 0.7x 效果不佳)、特性加成、PP 耗盡掙扎 (Struggle)
  //    - 支援對戰勝利獲得 EXP 經驗值、即時升級慶祝橫幅與隊員瀕死自動換人 (resolveFaint)
  // --------------------------------------------------------------------------
  let currentBattle = null;

  function normalizeElementKey(typeStr) {
    const s = String(typeStr || "").toUpperCase();
    if (s.includes("ELECTRIC") || s.includes("電")) return "ELECTRIC";
    if (s.includes("FIRE") || s.includes("火")) return "FIRE";
    if (s.includes("WATER") || s.includes("水")) return "WATER";
    if (s.includes("GRASS") || s.includes("草")) return "GRASS";
    if (s.includes("ROCK") || s.includes("岩")) return "ROCK";
    if (s.includes("GROUND") || s.includes("地")) return "GROUND";
    if (s.includes("ICE") || s.includes("冰")) return "ICE";
    if (s.includes("FLY") || s.includes("飛")) return "FLYING";
    if (s.includes("BUG") || s.includes("蟲")) return "BUG";
    if (s.includes("FAIRY") || s.includes("妖")) return "FAIRY";
    if (s.includes("FIGHT") || s.includes("格鬥")) return "FIGHTING";
    if (s.includes("DRAGON") || s.includes("龍")) return "DRAGON";
    if (s.includes("PSYCHIC") || s.includes("超能")) return "PSYCHIC";
    if (s.includes("STEEL") || s.includes("鋼")) return "STEEL";
    if (s.includes("DARK") || s.includes("惡") || s.includes("幽靈") || s.includes("毒")) return "DARK";
    return "NORMAL";
  }

  function getTypeEffectiveness(attackerType, defenderType) {
    const atkKey = normalizeElementKey(attackerType);
    const defKey = normalizeElementKey(defenderType);
    const chart = (DATA.typeAffinities && DATA.typeAffinities[atkKey]) || { strong: [], weak: [] };
    if (chart.strong.includes(defKey)) {
      return { mult: 1.6, label: "🔥 效果絕佳！(1.6x)", color: "#dc2626" };
    }
    if (chart.weak.includes(defKey)) {
      return { mult: 0.7, label: "🛡️ 效果不太好… (0.7x)", color: "#64748b" };
    }
    return { mult: 1.0, label: "⚡ 一般相性 (1.0x)", color: "#1e40af" };
  }

  function playEncounterTransition() {
    const transEl = document.getElementById("encounterTransition");
    if (!transEl) return;
    transEl.style.display = "block";
    // 重新觸發 CSS 動畫
    transEl.innerHTML = transEl.innerHTML;
    SFX.playAttack();
    setTimeout(() => {
      transEl.style.display = "none";
    }, 720);
  }

  function openBattleWindow(battleConfig, introMessage) {
    currentBattle = battleConfig;
    const banner = document.getElementById("battleLevelUpBanner");
    if (banner) banner.style.display = "none";
    const moveInfo = document.getElementById("battleMoveInfo");
    if (moveInfo) moveInfo.style.display = "none";

    playEncounterTransition();

    document.getElementById("gbaBattle").classList.remove("hidden");
    document.getElementById("battleSubMenu").style.display = "none";
    document.getElementById("battleMainCommands").style.display = "grid";

    renderBattleHUD();
    setBattleMessage(introMessage);
  }

  function startWildEncounter(regionId) {
    const lead = getLeadPokemon();
    if (!lead) return;
    const reg = DATA.regions[regionId] || getCurrentRegion();
    const pool = DATA.pokemonCatalog.filter((p) => p.regionId === regionId && p.id < 900);
    const chosenCat =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : DATA.pokemonCatalog.find((p) => p.regionId === "0,0");

    const [minLv, maxLv] = reg.levelRange || [3, 5];
    const enemyLv = minLv + Math.floor(Math.random() * (maxLv - minLv + 1));
    const scale = 1 + Math.max(0, enemyLv - chosenCat.minLv) * 0.1;
    const enemyTraits = pickTraitsForSeed(chosenCat.id * 11 + enemyLv, chosenCat.traits);

    const enemy = {
      id: chosenCat.id,
      id4: chosenCat.id4,
      name: chosenCat.name,
      enName: chosenCat.enName,
      type: chosenCat.type,
      typeEn: chosenCat.typeEn || "NORMAL",
      level: enemyLv,
      maxHp: Math.round(chosenCat.baseHp * scale) + (enemyTraits.includes("hearty") ? 6 : 0),
      hp: Math.round(chosenCat.baseHp * scale) + (enemyTraits.includes("hearty") ? 6 : 0),
      atk: Math.round(chosenCat.baseAtk * scale),
      def: Math.round(chosenCat.baseDef * scale),
      traits: enemyTraits,
      art: chosenCat.art || null,
      move: chosenCat.move || "撞擊",
      defeated: false
    };

    const untrainedWarning =
      lead.level <= 1 || (lead.atk < reg.recAtk && lead.def < reg.recDef)
        ? `\n⚠️ 警告：你的【${lead.name} Lv.${lead.level}】(⚔️${lead.atk}/🛡️${lead.def}) 尚未完成足夠的道館訓練，建議先回道館特訓！`
        : "";

    openBattleWindow(
      {
        kind: "wild",
        regionId,
        regionName: reg.name,
        enemy,
        busy: false
      },
      `🌿 在【${reg.name}】遇到了野生的【${enemy.name} Lv.${enemy.level}】（特性：${enemyTraits.map((t) => (DATA.traits[t]?.name || t).split(" ")[0]).join("/")}）！${untrainedWarning}`
    );
  }

  function startTrainerBattle(npcObj) {
    const lead = getLeadPokemon();
    if (!lead) return;
    const reg = getCurrentRegion();
    const pool = DATA.pokemonCatalog.filter((p) => p.regionId === reg.id && p.id < 900);
    const chosenCat = pool.length > 0 ? pool[pool.length - 1] : DATA.pokemonCatalog[4];
    const [, maxLv] = reg.levelRange || [3, 5];
    const enemyLv = maxLv + 1;
    const scale = 1 + Math.max(0, enemyLv - chosenCat.minLv) * 0.11;
    const enemyTraits = ["bold", "sturdy"];

    const enemy = {
      id: chosenCat.id,
      id4: chosenCat.id4,
      name: `${npcObj.name.split(" ")[0]}的${chosenCat.name}`,
      baseSpeciesId: chosenCat.id,
      type: chosenCat.type,
      typeEn: chosenCat.typeEn || "NORMAL",
      level: enemyLv,
      maxHp: Math.round(chosenCat.baseHp * scale) + 10,
      hp: Math.round(chosenCat.baseHp * scale) + 10,
      atk: Math.round(chosenCat.baseAtk * scale) + 3,
      def: Math.round(chosenCat.baseDef * scale) + 3,
      traits: enemyTraits,
      art: chosenCat.art || null,
      move: chosenCat.move || "全力一擊",
      defeated: false
    };

    openBattleWindow(
      {
        kind: "trainer",
        trainerKey: `${reg.id}:${npcObj.id}`,
        trainerName: npcObj.name,
        regionId: reg.id,
        regionName: reg.name,
        enemy,
        busy: false
      },
      `⚔️ 路線訓練家【${npcObj.name}】派出了王牌【${enemy.name} Lv.${enemy.level}】！\n（訓練家對戰無法逃跑或收服，獲勝可贏得豐厚獎金與大量 EXP！）`
    );
  }

  function startGuardianBattle(waystoneObj) {
    const lead = getLeadPokemon();
    if (!lead) return;
    const reg = getCurrentRegion();
    const extraPool = DATA.pokemonCatalog.filter((p) => p.id < 900 && p.regionId === reg.id);
    const chosenCat =
      extraPool.length > 0
        ? extraPool[extraPool.length - 1]
        : DATA.pokemonCatalog.filter((p) => p.regionId === reg.id).slice(-1)[0] || DATA.pokemonCatalog[0];

    const [, maxLv] = reg.levelRange || [3, 5];
    const enemyLv = maxLv + 2;
    const scale = 1 + Math.max(0, enemyLv - chosenCat.minLv) * 0.12;

    const enemy = {
      id: chosenCat.id,
      id4: chosenCat.id4,
      name: `守護者・${chosenCat.name}`,
      type: chosenCat.type,
      typeEn: chosenCat.typeEn || "DRAGON",
      level: enemyLv,
      maxHp: Math.round(chosenCat.baseHp * scale) + 18,
      hp: Math.round(chosenCat.baseHp * scale) + 18,
      atk: Math.round(chosenCat.baseAtk * scale) + 4,
      def: Math.round(chosenCat.baseDef * scale) + 4,
      traits: ["radiant", "hearty"],
      art: chosenCat.art || getDefaultArtForPokemon(chosenCat),
      move: chosenCat.move || "遠古星爆",
      defeated: false
    };

    openBattleWindow(
      {
        kind: "guardian",
        guardianKey: `${reg.id}:${waystoneObj.id}`,
        regionId: reg.id,
        regionName: reg.name,
        enemy,
        busy: false
      },
      `🗿 古老路標石綻放光芒！【${enemy.name} Lv.${enemy.level}】降臨了！\n擊敗石碑守護者後，除了獲得 ₽120+ 獎金與經驗糖果，還能投球收服牠！`
    );
  }

  function renderBattleHUD() {
    if (!currentBattle) return;
    const lead = getLeadPokemon();
    if (!lead) return;
    ensurePokemonFields(lead);
    const enemy = currentBattle.enemy;

    const modeBadge = document.getElementById("battleModeBadge");
    if (modeBadge) {
      if (currentBattle.kind === "trainer") {
        modeBadge.textContent = `⚔️ 訓練家對戰：${currentBattle.trainerName.split(" ")[0]}`;
        modeBadge.style.borderColor = "#f97316";
      } else if (currentBattle.kind === "guardian") {
        modeBadge.textContent = `🗿 石碑守護者 BOSS 戰`;
        modeBadge.style.borderColor = "#c084fc";
      } else {
        modeBadge.textContent = `🌿 野生遭遇戰 · ${currentBattle.regionName.split(" ")[0]}`;
        modeBadge.style.borderColor = "#facc15";
      }
    }

    const eTraitTxt = (enemy.traits || [])
      .map((t) => (DATA.traits[t]?.name || t).split(" ")[0])
      .join("/");
    document.getElementById("battleEnemyName").textContent = enemy.name;
    document.getElementById("battleEnemyLv").textContent = `Lv.${enemy.level}`;
    document.getElementById("battleEnemyStats").textContent =
      `⚔️${enemy.atk} · 🛡️${enemy.def} · ${enemy.type}系${eTraitTxt ? ` · ✦${eTraitTxt}` : ""}`;
    const ePct = Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
    const eBar = document.getElementById("battleEnemyHpBar");
    eBar.style.width = `${ePct}%`;
    eBar.style.background = ePct < 25 ? "#e05848" : ePct < 50 ? "#e8c840" : "#58b888";
    document.getElementById("battleEnemyHpTxt").textContent = `${enemy.hp} / ${enemy.maxHp}`;

    const eImg = document.getElementById("battleEnemySprite");
    eImg.src = getPokemonDisplayUrl(enemy, "front");
    eImg.onerror = () => {
      eImg.src = getPokemonFallbackUrl(enemy, "front");
    };
    eImg.style.opacity = enemy.defeated ? "0.55" : "1";

    const pTraitTxt = (lead.traits || [])
      .map((t) => (DATA.traits[t]?.name || t).split(" ")[0])
      .join("/");
    document.getElementById("battlePlayerName").textContent =
      `${lead.name}${lead.generation ? ` (G${lead.generation})` : ""}`;
    document.getElementById("battlePlayerLv").textContent = `Lv.${lead.level}`;
    document.getElementById("battlePlayerStats").textContent =
      `⚔️${lead.atk} · 🛡️${lead.def} · ${lead.type}系${pTraitTxt ? ` · ✦${pTraitTxt}` : ""}`;

    const pPct = Math.max(0, Math.min(100, (lead.hp / lead.maxHp) * 100));
    const pBar = document.getElementById("battlePlayerHpBar");
    pBar.style.width = `${pPct}%`;
    pBar.style.background = pPct < 25 ? "#e05848" : pPct < 50 ? "#e8c840" : "#58b888";
    document.getElementById("battlePlayerHpTxt").textContent = `${lead.hp} / ${lead.maxHp}`;

    // 更新 GBA 經驗值條 (.gba-xp)
    const xpMax = lead.xpToNext || 20;
    const xpPct = Math.max(0, Math.min(100, ((lead.xp || 0) / xpMax) * 100));
    const xpBar = document.getElementById("battlePlayerXpBar");
    const xpTxt = document.getElementById("battlePlayerXpTxt");
    if (xpBar) xpBar.style.width = `${xpPct}%`;
    if (xpTxt) xpTxt.textContent = `${lead.xp || 0}/${xpMax}`;

    const pImg = document.getElementById("battlePlayerSprite");
    pImg.src = getPokemonDisplayUrl(lead, "back");
    pImg.onerror = () => {
      pImg.src = getPokemonFallbackUrl(lead, "back");
    };
  }

  function setBattleMessage(msg) {
    const el = document.getElementById("battleMessage");
    if (el) el.textContent = msg;
  }

  function updateMoveInfoBox(moveKind) {
    const infoEl = document.getElementById("battleMoveInfo");
    if (!infoEl || !currentBattle) return;
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;
    if (!lead || !enemy) return;

    if (moveKind === "basic") {
      infoEl.innerHTML = `
        <strong>💥 ${lead.basicMove}</strong>
        <span>PP：${lead.attackPp} / ${lead.maxAttackPp}</span>
        <span>屬性：一般 (NORMAL)</span>
        <span style="color:#1e40af;">⚡ 穩定物理招式 (1.0x)</span>
      `;
    } else if (moveKind === "special") {
      const eff = getTypeEffectiveness(lead.typeEn || lead.type, enemy.typeEn || enemy.type);
      infoEl.innerHTML = `
        <strong>✨ ${lead.specialMove}</strong>
        <span>PP：${lead.specialPp} / ${lead.maxSpecialPp}</span>
        <span>屬性：${lead.type}系</span>
        <span style="color:${eff.color};">${eff.label}</span>
      `;
    } else if (moveKind === "struggle") {
      infoEl.innerHTML = `
        <strong style="color:#dc2626;">💢 掙扎 (Struggle)</strong>
        <span>PP：耗盡無限制</span>
        <span>效果：全力反擊但自身承受 1/4 反作用力傷害</span>
      `;
    } else if (moveKind === "gym-boost") {
      infoEl.innerHTML = `
        <strong>💡 道館知識蓄力</strong>
        <span>恢復 20% HP 並提升下一擊命中與氣勢！</span>
      `;
    }
  }

  function showBattleSubMenu(type) {
    if (!currentBattle || currentBattle.busy) return;
    SFX.playClick();
    const mainCmds = document.getElementById("battleMainCommands");
    const subMenu = document.getElementById("battleSubMenu");
    const moveInfo = document.getElementById("battleMoveInfo");
    const msgBox = document.getElementById("battleMessage");
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;

    if (type === "main") {
      subMenu.style.display = "none";
      if (moveInfo) moveInfo.style.display = "none";
      if (msgBox) msgBox.style.width = "56%";
      mainCmds.style.display = "grid";
      return;
    }

    mainCmds.style.display = "none";
    subMenu.style.display = "grid";

    if (type === "fight") {
      if (enemy.defeated) {
        if (currentBattle.kind === "trainer") {
          closeBattle();
          return;
        }
        setBattleMessage(`🎯 【${enemy.name}】已經被擊敗（HP 0）！請點選「BAG 背包/投球」丟出精靈球嘗試收服（約 60% 機率）！`);
        showBattleSubMenu("bag");
        return;
      }

      const bothZeroPp = (lead.attackPp || 0) <= 0 && (lead.specialPp || 0) <= 0;
      const eff = getTypeEffectiveness(lead.typeEn || lead.type, enemy.typeEn || enemy.type);

      if (moveInfo) {
        moveInfo.style.display = "flex";
        if (msgBox) msgBox.style.width = "28%";
        updateMoveInfoBox(bothZeroPp ? "struggle" : "special");
      }

      if (bothZeroPp) {
        subMenu.innerHTML = `
          <button data-move="struggle" style="color:#dc2626;grid-column:1/-1;">💢 掙扎 Struggle (PP 已耗盡，捨身攻擊)</button>
          <button data-move="gym-boost" style="color:#1d4ed8;">💡 道館知識蓄力 (+HP)</button>
          <button data-move="cancel" style="color:#64748b;">↩ 返回 (CANCEL)</button>
        `;
      } else {
        subMenu.innerHTML = `
          <button data-move="basic">${lead.basicMove} <small>(PP ${lead.attackPp}/${lead.maxAttackPp})</small></button>
          <button data-move="special">${lead.specialMove} <small style="color:${eff.color};">(PP ${lead.specialPp}/${lead.maxSpecialPp} · ${eff.mult}x)</small></button>
          <button data-move="gym-boost" style="color:#1d4ed8;">💡 道館知識蓄力 (+HP)</button>
          <button data-move="cancel" style="color:#64748b;">↩ 返回 (CANCEL)</button>
        `;
      }

      subMenu.querySelectorAll("button[data-move]").forEach((btn) => {
        const mv = btn.getAttribute("data-move");
        btn.addEventListener("pointerenter", () => {
          if (mv !== "cancel") updateMoveInfoBox(mv);
        });
        btn.onclick = () => {
          if (mv === "cancel") showBattleSubMenu("main");
          else executePlayerMove(mv);
        };
      });
    } else if (type === "bag") {
      if (moveInfo) moveInfo.style.display = "none";
      if (msgBox) msgBox.style.width = "56%";
      const usableIds = ["poke-ball", "great-ball", "ultra-ball", "potion", "super-potion", "hyper-potion", "ether", "exp-candy-s"];
      const buttonsHtml = usableIds
        .filter((id) => (state.items[id] || 0) > 0)
        .map((id) => {
          const item = DATA.shopItems.find((it) => it.id === id);
          if (!item) return "";
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
      if (moveInfo) moveInfo.style.display = "none";
      if (msgBox) msgBox.style.width = "56%";
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
    ensurePokemonFields(lead);

    showBattleSubMenu("main");
    currentBattle.busy = true;

    if (moveKind === "gym-boost") {
      SFX.playHeal();
      const healAmt = Math.max(6, Math.round(lead.maxHp * 0.22));
      lead.hp = Math.min(lead.maxHp, lead.hp + healAmt);
      renderBattleHUD();
      setBattleMessage(`✨ 【${lead.name}】回想國語文道館與數學道館所學，恢復了 ${healAmt} 點 HP！`);
      setTimeout(() => enemyTurnAttack(), 1000);
      return;
    }

    const isStruggle = moveKind === "struggle";
    const isSpecial = moveKind === "special";
    if (isSpecial && lead.specialPp <= 0) {
      currentBattle.busy = false;
      setBattleMessage(`⚠️ 【${lead.specialMove}】的 PP 已經用完了！請使用普通招式或以太回復。`);
      return;
    }
    if (!isStruggle && !isSpecial && lead.attackPp <= 0) {
      currentBattle.busy = false;
      setBattleMessage(`⚠️ 【${lead.basicMove}】的 PP 已經用完了！請選擇其他招式。`);
      return;
    }

    if (isSpecial) lead.specialPp = Math.max(0, lead.specialPp - 1);
    else if (!isStruggle) lead.attackPp = Math.max(0, lead.attackPp - 1);

    const moveName = isStruggle ? "掙扎 (Struggle)" : isSpecial ? lead.specialMove : lead.basicMove;

    // 計算屬性相剋與特性倍率 (100% 對齊 infinite-pokemon skills-v0.2.0)
    const eff = isSpecial
      ? getTypeEffectiveness(lead.typeEn || lead.type, enemy.typeEn || enemy.type)
      : { mult: 1.0, label: "" };
    const traitBoldMult = (lead.traits || []).includes("bold") ? 1.15 : 1.0;
    const enemyGentleMult = (enemy.traits || []).includes("gentle") ? 0.88 : 1.0;
    const critChance = (lead.traits || []).includes("swift") ? 0.24 : 0.08;
    const isCrit = Math.random() < critChance;
    const critMult = isCrit ? 1.35 : 1.0;

    const baseMult = isStruggle ? 0.95 : isSpecial ? 1.32 * eff.mult : 1.0;
    const rawDmg = (lead.atk * baseMult * traitBoldMult * critMult - enemy.def * 0.7) * enemyGentleMult;
    const dmg =
      rawDmg <= 1
        ? Math.max(1, Math.floor(Math.random() * 2) + 1)
        : Math.max(3, Math.round(rawDmg + Math.random() * 4));

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

    // 若使用掙扎 (Struggle)，承受 1/4 最大 HP 反作用力傷害
    let recoilNote = "";
    if (isStruggle) {
      const recoil = Math.max(1, Math.round(lead.maxHp / 4));
      lead.hp = Math.max(1, lead.hp - recoil);
      recoilNote = `（承受掙扎反作用力 ${recoil} 點傷害）`;
    }

    renderBattleHUD();
    updateAllHUD();

    const effNote = isSpecial && eff.mult !== 1.0 ? ` ${eff.label}` : "";
    const critNote = isCrit ? " 💥會心一擊！" : "";

    if (enemy.hp <= 0) {
      enemy.defeated = true;
      currentBattle.busy = false;
      SFX.playCorrect();

      // 勝利獎勵計算：金幣 + 傷藥掉落 + 戰鬥經驗值 EXP (對齊 infinite-pokemon world.ts)
      const isGuardian = currentBattle.kind === "guardian";
      const isTrainer = currentBattle.kind === "trainer";
      const coinDrop = isGuardian ? 120 + enemy.level * 6 : isTrainer ? 50 + enemy.level * 8 : 35 + enemy.level * 5;
      // 對外戰鬥只提供象徵性 EXP；主要升級必須回到國語文／數學道館完成訓練。
      const expReward = isGuardian ? 3 : isTrainer ? 2 : 1;

      state.coins = (state.coins || 0) + coinDrop;
      state.items["potion"] = Math.min(30, (state.items["potion"] || 0) + 1);
      if (isGuardian) {
        state.items["exp-candy-s"] = (state.items["exp-candy-s"] || 0) + 1;
        if (currentBattle.guardianKey && !state.defeatedGuardians.includes(currentBattle.guardianKey)) {
          state.defeatedGuardians.push(currentBattle.guardianKey);
        }
      }
      if (isTrainer && currentBattle.trainerKey && !state.defeatedTrainers.includes(currentBattle.trainerKey)) {
        state.defeatedTrainers.push(currentBattle.trainerKey);
      }

      // 賦予經驗值並檢查是否升級
      const lvResult = gainPokemonExp(lead, expReward, true);
      // 隊伍其他成員只獲得極少量共享經驗值，避免靠外戰快速升級。
      state.party.forEach((member, idx) => {
        if (idx !== state.activeIndex && member.hp > 0) {
          gainPokemonExp(member, 1, false);
        }
      });

      saveGame();
      updateAllHUD();
      renderBattleHUD();

      const lvUpTxt = lvResult.leveledUp
        ? `\n🆙 【${lead.name}】獲得 +${lvResult.expGain} EXP，升上了 Lv.${lead.level}！（HP+${lvResult.totalHpGain}/ATK+${lvResult.totalAtkGain}/DEF+${lvResult.totalDefGain}）`
        : `\n✨ 【${lead.name}】獲得 +${lvResult.expGain} EXP（距離升級還差 ${(lead.xpToNext || 20) - (lead.xp || 0)} EXP）！`;

      if (isTrainer) {
        addJournalEntry(`🏆 擊敗了路線訓練家【${currentBattle.trainerName}】，贏得 ₽${coinDrop}！`);
        setBattleMessage(
          `🎉 【${lead.name}】使出「${moveName}」${critNote}${effNote}造成 ${dmg} 點傷害，擊敗了訓練家【${currentBattle.trainerName}】的寶可夢！\n🪙 獲得獎金 ₽${coinDrop} 與 傷藥 ×1！${lvUpTxt}`
        );
        setTimeout(() => {
          closeBattle();
          showToast(`🏆 訓練家對戰勝利！獲得 ₽${coinDrop} 與 +${lvResult.expGain} EXP！`);
        }, 2600);
        return;
      }

      setBattleMessage(
        `🎉 【${lead.name}】使出「${moveName}」${critNote}${effNote}造成 ${dmg} 點傷害，擊敗了【${enemy.name}】（獲得金幣 ₽${coinDrop}、傷藥×1${isGuardian ? "、經驗糖果S×1" : ""}）！${lvUpTxt}\n👉 現在請點選「BAG 背包/投球」丟出精靈球收服牠（或點 RUN 離開）！`
      );
      return;
    }

    const weakHint =
      dmg <= 2
        ? `\n（💡 傷害太低了！建議去「📕國語文道館」特訓或餵食「經驗糖果」升級！）`
        : "";
    setBattleMessage(
      `⚡ 【${lead.name}】使出「${moveName}」${critNote}${effNote}，對【${enemy.name}】造成了 ${dmg} 點傷害！${recoilNote}${weakHint}`
    );

    setTimeout(() => {
      enemyTurnAttack();
    }, 1050);
  }

  function enemyTurnAttack() {
    if (!currentBattle) return;
    const lead = getLeadPokemon();
    const enemy = currentBattle.enemy;
    if (!lead || enemy.defeated) {
      if (currentBattle) currentBattle.busy = false;
      return;
    }

    // 檢查我方靈巧 (elusive) 特性閃避
    if ((lead.traits || []).includes("elusive") && Math.random() < 0.14) {
      currentBattle.busy = false;
      setBattleMessage(`💨 【${enemy.name}】使出「${enemy.move}」，但【${lead.name}】憑藉「✦靈巧」特性華麗閃開了攻擊！`);
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

    const eff = getTypeEffectiveness(enemy.typeEn || enemy.type, lead.typeEn || lead.type);
    const enemyBoldMult = (enemy.traits || []).includes("bold") ? 1.12 : 1.0;
    const playerGentleMult = (lead.traits || []).includes("gentle") ? 0.85 : 1.0;

    // 若主角尚未去數學道館訓練（DEF 遠低於怪獸 ATK），會受到較高傷害
    const rawEnemyDmg = (enemy.atk * 1.08 * eff.mult * enemyBoldMult - lead.def * 0.68) * playerGentleMult;
    const eDmg = Math.max(2, Math.round(rawEnemyDmg + Math.random() * 3));
    lead.hp = Math.max(0, lead.hp - eDmg);
    renderBattleHUD();
    updateAllHUD();

    if (lead.hp <= 0) {
      SFX.playWrong();
      // 檢查隊伍中是否還有其他健康的寶可夢可自動接替出戰 (對齊 infinite-pokemon resolveFaint)
      const nextHealthyIdx = state.party.findIndex((p, idx) => idx !== state.activeIndex && p.hp > 0);
      if (nextHealthyIdx !== -1) {
        const faintedName = lead.name;
        state.activeIndex = nextHealthyIdx;
        const nextLead = getLeadPokemon();
        saveGame();
        renderBattleHUD();
        updateAllHUD();
        currentBattle.busy = false;
        setBattleMessage(
          `💥 【${faintedName}】體力不支倒下了！\n🔄 隊伍中的【${nextLead.name} Lv.${nextLead.level}】立即挺身而出接替戰鬥！請選擇行動！`
        );
        return;
      }

      setBattleMessage(
        `💥 【${enemy.name} Lv.${enemy.level}】使出「${enemy.move}」造成 ${eDmg} 點傷害！【${lead.name}】倒下了！\n🏥 你被送回柳溪醫療所恢復體力。請先去「📕國語文道館」與「📘數學道館」訓練或餵食經驗糖果變強後再來挑戰！`
      );
      setTimeout(() => {
        closeBattle();
        state.regionId = "0,0";
        state.x = 16;
        state.y = 12;
        healAllParty(false);
        openDialogueModal(
          "💡 空木博士的提醒：先強化升級，達到等級條件就會進化！",
          `你的【${lead.name}】（Lv.${lead.level} · ⚔️ATK ${lead.atk} · 🛡️DEF ${lead.def}）目前能力還不足以擊敗【${enemy.name} Lv.${enemy.level}】！\n\n你可以透過以下方式大幅強化戰力：\n1. 進入「📕 國語文道館」提升【攻擊力 ⚔️ATK 與等級】\n2. 進入「📘 數學道館」提升【防禦力 🛡️DEF 與最大 HP】\n3. 在「🐾 隊伍」餵食經驗糖果升級，達到進化等級後會自動進化！`,
          [
            { label: "📕 前往國語文道館 (+ATK)", onClick: () => openChineseGym("a") },
            { label: "📘 前往數學道館 (+DEF)", onClick: () => openMathGym("a") }
          ]
        );
      }, 2200);
      return;
    }

    currentBattle.busy = false;
    const effTxt = eff.mult > 1 ? "（效果絕佳！）" : eff.mult < 1 ? "（效果不太好）" : "";
    setBattleMessage(
      `💢 【${enemy.name}】使出「${enemy.move}」${effTxt}，對【${lead.name}】造成 ${eDmg} 點傷害！請選擇下一回合行動！`
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
      if (currentBattle.kind === "trainer") {
        SFX.playWrong();
        setBattleMessage("⚠️ 不能收服其他訓練家的寶可夢喔！");
        return;
      }
      // 大師球 (guaranteedCapture) 可無視血量直接 100% 收服！一般球則需打敗對手或削弱至 35% 以下
      if (!item.guaranteedCapture && !enemy.defeated && enemy.hp > enemy.maxHp * 0.35) {
        SFX.playWrong();
        setBattleMessage(
          `⚠️ 【${enemy.name}】現在還精力充沛（HP ${enemy.hp}/${enemy.maxHp}），直接丟球會被彈開！請先用「FIGHT 戰鬥」打敗或削弱牠（或投擲大師球）！`
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
      const elusivePenalty = (enemy.traits || []).includes("elusive") ? 0.08 : 0;
      const baseRate = item.guaranteedCapture
        ? 1.0
        : Math.max(0.25, (enemy.defeated ? item.power : item.power * 0.65) - elusivePenalty);
      setBattleMessage(
        `🟣 你丟出了【${item.name}】！（收服成功率 ${item.guaranteedCapture ? "100% 必定成功！" : `約 ${Math.round(baseRate * 100)}%`}）……咕嚕……咕嚕……`
      );

      setTimeout(() => {
        ballEl.style.display = "none";
        const success = item.guaranteedCapture ? true : Math.random() < baseRate;

        if (success) {
          SFX.playCaptureSuccess();
          const bonusLv = (state.items["rare-candy"] || 0) * 2;
          const newPoke = createPokemonInstance(enemy.baseSpeciesId || enemy.id, enemy.level + bonusLv, false);
          if (state.party.length < 6) {
            state.party.push(newPoke);
          } else {
            state.storage.push(newPoke);
          }
          const catchId = enemy.baseSpeciesId || enemy.id;
          if (!state.caughtIds.includes(catchId)) {
            state.caughtIds.push(catchId);
          }
          // 收服只給象徵性 EXP；真正成長仍需完成道館訓練。
          gainPokemonExp(lead, 1, true);
          addJournalEntry(`🔴 成功收服了【${newPoke.name} Lv.${newPoke.level}】！`);
          saveGame();
          updateAllHUD();
          setBattleMessage(
            `✨ 喀嚓！太棒了！你成功收服了【${newPoke.name} Lv.${newPoke.level}】！\n（已加入你的${state.party.length <= 6 ? "出戰隊伍" : "寶可夢倉庫"}與圖鑑，出戰夥伴僅獲得 +1 EXP；請回道館訓練升級。）`
          );
          showToast(`🎉 成功收服【${newPoke.name} Lv.${newPoke.level}】！`);
          setTimeout(() => {
            closeBattle();
          }, 1900);
        } else {
          SFX.playWrong();
          currentBattle.busy = false;
          if (enemy.defeated) {
            setBattleMessage(
              `💨 哎呀！差一點點！【${enemy.name}】從球裡掙脫了！（即使打敗對手，收服機率約為六成，牠還沒有逃走，可再從 BAG 丟一顆球試試！）`
            );
          } else {
            setBattleMessage(`💨 【${enemy.name}】掙脫了精靈球！先把牠的 HP 打到 0 再投球成功率更高喔！`);
            setTimeout(() => enemyTurnAttack(), 1000);
          }
        }
      }, 1500);
      return;
    }

    if (item.effect === "exp-candy" || item.effect === "rare-candy" || item.effect === "lucky-egg") {
      state.items[itemId]--;
      const xpAmt = item.effect === "rare-candy" ? (lead.xpToNext || 20) * 2 : item.effect === "lucky-egg" ? 30 : item.power || 20;
      gainPokemonExp(lead, xpAmt, true);
      saveGame();
      renderBattleHUD();
      updateAllHUD();
      setBattleMessage(`🍬 在戰鬥中使用了【${item.name}】！【${lead.name}】升至 Lv.${lead.level}（HP ${lead.hp}/${lead.maxHp}）！`);
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
    const banner = document.getElementById("battleLevelUpBanner");
    if (banner) banner.style.display = "none";
    document.getElementById("gbaBattle").classList.add("hidden");
    updateAllHUD();
  }

  // --------------------------------------------------------------------------
  // 8. START 選單與通用視窗 (POKÉMON 隊伍與升級 / NURSERY 培育屋合成 / BAG / SHOP / MAP / CODEX / RECORDS / SAVE)
  // --------------------------------------------------------------------------
  function openMenuModal(tab) {
    if (tab === "nursery") tab = "party";
    SFX.playClick();
    document.getElementById("startMenu").style.display = "none";
    const modal = document.getElementById("menuModal");
    const box = document.getElementById("menuModalBox");
    const titleEl = document.getElementById("menuModalTitle");
    const bodyEl = document.getElementById("menuModalBody");

    box.classList.toggle("wide", ["party", "nursery", "bag", "map", "shop", "codex", "records", "save"].includes(tab));
    modal.classList.remove("hidden");

    const titles = {
      party: "YOUR POKÉMON · 寶可夢隊伍、經驗升級與突破進化",
      nursery: "POKÉMON PARTY · 等級進化隊伍",
      bag: "YOUR BAG · 背包道具與補給",
      shop: "POKÉMON SHOP · 柳溪寶可夢商店（購買精靈球、經驗糖果與特殊道具）",
      map: "TOWN MAP · 五大區域地圖與等級劃分",
      codex: "COMPANION CODEX · 寶可夢收服與合成圖鑑",
      records: "ADVENTURE RECORDS · 柳溪谷冒險排行榜與日誌",
      trainer: "TRAINER CARD · 訓練家狀態名片",
      save: "SAVE & LOAD · 儲存與讀取冒險進度"
    };
    titleEl.textContent = titles[tab] || "MENU";

    // ------------------------------------------------------------------------
    // Tab 1: 寶可夢隊伍、升級 (EXP Candy / 金幣特訓) 與突破進化 (Party & Upgrade)
    // ------------------------------------------------------------------------
    if (tab === "party") {
      const candyS = state.items["exp-candy-s"] || 0;
      const candyL = state.items["exp-candy-l"] || 0;

      const partyCards = state.party
        .map((p, idx) => {
          ensurePokemonFields(p);
          const isLeader = idx === state.activeIndex;
          const pct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
          const xpMax = p.xpToNext || 20;
          const xpPct = Math.max(0, Math.min(100, ((p.xp || 0) / xpMax) * 100));
          const genBadge = p.generation > 0 ? `<span class="gen-badge">🧬 第${p.generation}代合成獸</span>` : "";
          const stageBadge = p.breakthroughStage > 0 ? `<span class="breakthrough-badge">🌟 突破★${p.breakthroughStage}</span>` : "";
          const traitsHtml = formatTraitBadges(p.traits);

          return `
          <div class="companion-card ${isLeader ? "active" : ""}" style="flex-wrap:wrap;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:14px;flex:1 1 320px;cursor:pointer;" data-party-idx="${idx}" title="點擊設為出戰隊長">
              <img src="${getPokemonDisplayUrl(p, "portrait")}" onerror="this.src='${getPokemonFallbackUrl(p, "portrait")}'" alt="${p.name}" style="width:68px;height:68px;image-rendering:pixelated;object-fit:contain;background:rgba(255,255,255,0.75);border-radius:6px;border:2px solid #94a3b8;" />
              <div style="flex:1 1;">
                <strong style="font-size:20px;">
                  ${p.name} <span style="font-size:15px;color:#1e40af;">Lv.${p.level} ${isLeader ? "· ★ 出戰隊長" : ""}</span>
                </strong>
                <div style="margin:3px 0;">
                  ${genBadge}${stageBadge}${traitsHtml}
                </div>
                <span style="font-size:14px;color:#334155;font-weight:800;display:block;">
                  ${p.type}系 · ⚔️攻擊 ${p.atk} · 🛡️防禦 ${p.def} · 絕招：${p.specialMove}
                </span>
                <div class="health" style="margin-top:5px;">
                  <span>HP</span>
                  <div><i style="width:${pct}%;background:${pct < 25 ? "#df7666" : pct < 50 ? "#e4be5e" : "#58b888"};"></i></div>
                  <small>${p.hp}/${p.maxHp}</small>
                </div>
                <div class="hud-xp-row" style="margin-top:4px;">
                  <span>EXP</span>
                  <div><i style="width:${xpPct}%;"></i></div>
                  <small>${p.xp || 0}/${xpMax} (滿 20 升級)</small>
                </div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;min-width:165px;">
              ${
                !isLeader
                  ? `<button type="button" class="button primary" data-set-leader="${idx}" style="font-size:14px;padding:4px 10px;min-height:30px;">⚡ 設為出戰隊長</button>`
                  : `<span style="font-size:13px;font-weight:900;color:#15803d;text-align:center;">✅ 當前出戰隊長</span>`
              }
              <button type="button" class="button gold" data-levelup-poke="${idx}" style="font-size:14px;padding:4px 10px;min-height:32px;">
                ⬆️ 升級強化 ${candyS > 0 ? `(糖果S×${candyS})` : `(₽60 特訓)`}
              </button>
              <button type="button" class="button" data-send-nursery="${p.uid}" style="font-size:13px;padding:4px 10px;min-height:30px;border-color:#7e22ce;color:#581c87;background:#f3e8ff;">
                🧬 送去培育屋合成
              </button>
            </div>
          </div>
        `;
        })
        .join("");

      const storageRows = state.storage
        .map((p, sIdx) => {
          ensurePokemonFields(p);
          return `
          <div class="catalog-row">
            <img src="${getPokemonDisplayUrl(p, "portrait")}" onerror="this.src='${getPokemonFallbackUrl(p, "portrait")}'" style="width:48px;height:48px;image-rendering:pixelated;object-fit:contain;" />
            <div>
              <strong>${p.name} · Lv.${p.level} ${p.generation ? `(🧬第${p.generation}代)` : ""}</strong>
              <p>${p.type}系 · ⚔️ATK ${p.atk} · 🛡️DEF ${p.def} · HP ${p.hp}/${p.maxHp}</p>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="button" data-swap-storage="${sIdx}">與隊長交換</button>
              <button type="button" class="button" data-send-nursery="${p.uid}" style="border-color:#7e22ce;color:#581c87;background:#f3e8ff;">🧬 合成</button>
            </div>
          </div>
        `;
        })
        .join("");

      bodyEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;background:#f1f5f9;padding:8px 12px;border-radius:6px;border:2px solid #cbd5e1;">
          <div>
            <span>隨身隊伍：<strong>${state.party.length} / 6 隻</strong> ｜ 🪙 金幣：<strong>₽${state.coins}</strong> ｜ 🍬 經驗糖果S：<strong>${candyS}</strong> · 糖果L：<strong>${candyL}</strong></span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="button primary" id="btnPartyHealAll" style="font-size:15px;padding:5px 12px;">💖 免費全隊恢復滿血</button>
          </div>
        </div>
        <div class="party-list">${partyCards}</div>
        <p style="margin:14px 0 6px;font-weight:800;color:#475569;">📦 電腦倉庫中的寶可夢（${state.storage.length} 隻）：</p>
        <div class="catalog-list">${storageRows || `<div style="color:#64748b;font-size:15px;">倉庫目前是空的（當隊伍滿 6 隻時，新收服的寶可夢會存放在這裡）。</div>`}</div>
      `;

      const setLeaderFn = (idx) => {
        state.activeIndex = idx;
        SFX.playClick();
        saveGame();
        updateAllHUD();
        openMenuModal("party");
        showToast(`⚡ 已將【${getLeadPokemon().name}】設為出戰隊長！`);
      };

      bodyEl.querySelectorAll("[data-party-idx]").forEach((el) => {
        el.onclick = () => setLeaderFn(parseInt(el.getAttribute("data-party-idx"), 10));
      });
      bodyEl.querySelectorAll("button[data-set-leader]").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          setLeaderFn(parseInt(btn.getAttribute("data-set-leader"), 10));
        };
      });

      // 升級強化按鈕 (優先使用經驗糖果 S/L，若無糖果可用 ₽60 金幣進行特訓升級)
      bodyEl.querySelectorAll("button[data-levelup-poke]").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute("data-levelup-poke"), 10);
          const targetPoke = state.party[idx];
          if (!targetPoke) return;

          if ((state.items["exp-candy-s"] || 0) > 0) {
            state.items["exp-candy-s"]--;
            const res = gainPokemonExp(targetPoke, 20, false);
            saveGame();
            updateAllHUD();
            openMenuModal("party");
            showToast(`🍬 餵食【經驗糖果 S】！【${targetPoke.name}】升至 Lv.${targetPoke.level}（HP+${res.totalHpGain}/ATK+${res.totalAtkGain}/DEF+${res.totalDefGain}）！`);
          } else if ((state.items["exp-candy-l"] || 0) > 0) {
            state.items["exp-candy-l"]--;
            const res = gainPokemonExp(targetPoke, 60, false);
            saveGame();
            updateAllHUD();
            openMenuModal("party");
            showToast(`🍬 餵食【經驗糖果 L】！【${targetPoke.name}】連升 ${res.levelsGained} 級至 Lv.${targetPoke.level}！`);
          } else if (state.coins >= 60) {
            state.coins -= 60;
            const res = gainPokemonExp(targetPoke, 20, false);
            saveGame();
            updateAllHUD();
            openMenuModal("party");
            showToast(`⬆️ 消耗 ₽60 完成強化特訓！【${targetPoke.name}】升至 Lv.${targetPoke.level}（HP+${res.totalHpGain}/ATK+${res.totalAtkGain}/DEF+${res.totalDefGain}）！`);
          } else {
            SFX.playWrong();
            showToast("⚠️ 經驗糖果與金幣（需 ₽60）不足！請先去國語/數學道館答題或開啟地圖寶箱賺取金幣！");
          }
        };
      });

      // 星輝突破進化按鈕
      bodyEl.querySelectorAll("button[data-breakthrough-poke]").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute("data-breakthrough-poke"), 10);
          const targetPoke = state.party[idx];
          if (!targetPoke) return;
          ensurePokemonFields(targetPoke);

          if ((state.items["evo-stone"] || 0) > 0) {
            state.items["evo-stone"]--;
          } else if (state.coins >= 240) {
            state.coins -= 240;
          } else {
            SFX.playWrong();
            showToast("⚠️ 需要 1 顆【星輝突破石】或 ₽240 金幣才能進行突破進化！");
            return;
          }

          targetPoke.breakthroughStage = (targetPoke.breakthroughStage || 0) + 1;
          targetPoke.level += 1;
          targetPoke.maxHp += 20;
          targetPoke.hp = targetPoke.maxHp;
          targetPoke.atk += 6;
          targetPoke.def += 6;
          if (!targetPoke.name.includes("★")) {
            targetPoke.name = `${targetPoke.name}★`;
          }
          SFX.playHatch();
          addJournalEntry(`🌟 【${targetPoke.name}】完成了第 ${targetPoke.breakthroughStage} 階星輝突破進化！`);
          saveGame();
          updateAllHUD();
          openMenuModal("party");
          showToast(`🌟 突破進化成功！【${targetPoke.name}】升至 Lv.${targetPoke.level}（最大HP+20 · ⚔️ATK+6 · 🛡️DEF+6）！`);
        };
      });

      // 送往培育屋合成按鈕
      bodyEl.querySelectorAll("button[data-send-nursery]").forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const uid = btn.getAttribute("data-send-nursery");
          if (!nurserySelA || nurserySelA === uid) {
            nurserySelA = uid;
          } else {
            nurserySelB = uid;
          }
          openMenuModal("nursery");
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

      document.getElementById("btnPartyToNursery").onclick = () => openMenuModal("nursery");
      document.getElementById("btnPartyHealAll").onclick = () => {
        healAllParty(true);
        openMenuModal("party");
      };
      return;
    }

    // ------------------------------------------------------------------------
    // Tab 2: 培育屋合成與孵蛋工坊 (NURSERY — 100% 參考 infinite-pokemon VarietyPanels.tsx & content.ts)
    // ------------------------------------------------------------------------
    if (tab === "nursery") {
      const allOwned = [...state.party, ...state.storage].map(ensurePokemonFields);
      const eligible = allOwned.filter((p) => p.hp > 0 && p.level >= 5);

      if (!nurserySelA && eligible[0]) nurserySelA = eligible[0].uid;
      if (!nurserySelB && eligible[1]) nurserySelB = eligible[1].uid;
      if (nurserySelA === nurserySelB && eligible.length > 1) {
        const other = eligible.find((p) => p.uid !== nurserySelA);
        nurserySelB = other ? other.uid : null;
      }

      const parentA = allOwned.find((p) => p.uid === nurserySelA) || null;
      const parentB = allOwned.find((p) => p.uid === nurserySelB && p.uid !== nurserySelA) || null;
      const canPreview = Boolean(parentA && parentB && parentA.level >= 5 && parentB.level >= 5);
      const previewChild = canPreview ? buildSynthesizedSpecies(parentA, parentB, nurseryCustomName) : null;

      const eggHtml = state.egg
        ? `
          <div class="egg-card">
            <div class="egg-icon-pulse"></div>
            <div style="flex:1 1 240px;">
              <strong style="font-size:20px;color:#581c87;">
                🥚 正在孵化的合成蛋：【${state.egg.childSpecies?.name || "神祕合成獸"}】（第 ${state.egg.childSpecies?.generation || 1} 代）
              </strong>
              <p style="font-size:14px;color:#4c1d95;margin-top:2px;">
                親代組合：${(state.egg.parentNames || []).join(" × ")} ｜ 屬性：${state.egg.childSpecies?.type || "雙屬性"} ｜ 距離孵化剩餘：<strong>${state.egg.stepsRemaining} 步</strong>
              </p>
              <div class="health" style="margin-top:6px;">
                <span>孵化進度</span>
                <div><i style="width:${Math.round(((32 - (state.egg.stepsRemaining || 0)) / 32) * 100)}%;background:#a855f7;"></i></div>
                <small>${32 - (state.egg.stepsRemaining || 0)} / 32 步</small>
              </div>
            </div>
            <button type="button" class="button primary" id="btnHatchEggNow" style="background:#7e22ce;border-color:#581c87;color:#fff;">
              ⚡ 道館能量立即孵化！
            </button>
          </div>
        `
        : "";

      const renderSlotCard = (slotLabel, pObj) => {
        if (!pObj) {
          return `
            <div class="parent-slot-box">
              <div style="font-size:30px;">➕</div>
              <div>
                <strong>${slotLabel}：尚未選擇</strong>
                <div style="font-size:13px;color:#64748b;">請從下方點選 1 隻 Lv.5 以上的健康寶可夢</div>
              </div>
            </div>
          `;
        }
        return `
          <div class="parent-slot-box filled">
            <img src="${getPokemonDisplayUrl(pObj, "portrait")}" onerror="this.src='${getPokemonFallbackUrl(pObj, "portrait")}'" alt="${pObj.name}" />
            <div>
              <strong style="font-size:18px;color:#4c1d95;">${slotLabel}：${pObj.name} (Lv.${pObj.level})</strong>
              <div style="font-size:13px;color:#334155;font-weight:800;">
                ${pObj.type}系 · ⚔️${pObj.atk} / 🛡️${pObj.def} / ❤️${pObj.maxHp}
              </div>
              <div>${formatTraitBadges(pObj.traits)}</div>
            </div>
          </div>
        `;
      };

      const previewHtml = previewChild
        ? `
          <div class="hybrid-preview-box">
            <img src="${generatePixelCreatureDataUrl(previewChild.art, false)}" alt="${previewChild.name}" />
            <div style="flex:1 1 260px;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="gen-badge">🧬 第 ${previewChild.generation} 代合成物種預覽</span>
                <strong style="font-size:22px;color:#4c1d95;">【${previewChild.name}】 (${previewChild.enName})</strong>
                <span style="font-size:14px;font-weight:900;color:#1e40af;">初始 Lv.${previewChild.minLv}</span>
              </div>
              <div style="font-size:14px;color:#334155;font-weight:800;margin-top:4px;">
                融合雙屬性：<strong>${previewChild.type}系</strong> ｜ 繼承能力：❤️HP <strong>${previewChild.baseHp}</strong> · ⚔️ATK <strong>${previewChild.baseAtk}</strong> · 🛡️DEF <strong>${previewChild.baseDef}</strong> ｜ 融合絕招：<strong>${previewChild.move}</strong>
              </div>
              <div style="margin-top:4px;">
                繼承特性：${formatTraitBadges(previewChild.traits)}
              </div>
              <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <label style="font-size:14px;font-weight:800;color:#581c87;">✏️ 自訂合成獸名稱：</label>
                <input type="text" id="inputHybridName" value="${nurseryCustomName}" placeholder="留空則使用「${previewChild.name}」" maxlength="10" style="padding:4px 8px;border:2px solid #a855f7;border-radius:4px;font-size:15px;width:190px;" />
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button type="button" class="button primary" id="btnBreedInstant" ${state.coins < 120 ? "disabled" : ""} style="background:#7e22ce;border-color:#4c1d95;color:#fff;">
                ⚡ 立即合成誕生 (₽120)
              </button>
              <button type="button" class="button gold" id="btnBreedEgg" ${state.egg || state.coins < 120 ? "disabled" : ""}>
                🥚 領取合成蛋 (₽120 · 走32步孵化)
              </button>
            </div>
          </div>
        `
        : `
          <div style="background:#fef2f2;border:2px solid #f87171;border-radius:8px;padding:12px 14px;margin-bottom:12px;color:#991b1b;font-weight:800;font-size:15px;">
            💡 請在下方選擇 <strong>2 隻達 Lv.5 以上的健康寶可夢</strong> 作為「親代 A」與「親代 B」，即可預覽並合成出繼承雙親屬性、特性與高能力值的全新合成寶可夢！（親代不會消失，會留在你的隊伍中！）
          </div>
        `;

      const companionRows = allOwned
        .map((p) => {
          const isA = p.uid === nurserySelA;
          const isB = p.uid === nurserySelB;
          const lvOk = p.level >= 5 && p.hp > 0;
          return `
            <div class="catalog-row" style="background:${isA || isB ? "#f3e8ff" : lvOk ? "#e8ecd8" : "#f1f5f9"};border-color:${isA || isB ? "#7e22ce" : "#a0b0a8"};">
              <img src="${getPokemonDisplayUrl(p, "portrait")}" onerror="this.src='${getPokemonFallbackUrl(p, "portrait")}'" style="width:52px;height:52px;image-rendering:pixelated;object-fit:contain;background:#fff;border-radius:6px;border:2px solid #94a3b8;" />
              <div>
                <strong>
                  ${p.name} · Lv.${p.level}
                  ${p.generation ? `<span class="gen-badge">第${p.generation}代</span>` : ""}
                  ${isA ? `<span class="gen-badge" style="background:#7e22ce;color:#fff;">親代 A</span>` : ""}
                  ${isB ? `<span class="gen-badge" style="background:#2563eb;color:#fff;">親代 B</span>` : ""}
                </strong>
                <p>${p.type}系 · ⚔️ATK ${p.atk} · 🛡️DEF ${p.def} · HP ${p.hp}/${p.maxHp} · 絕招：${p.specialMove}</p>
                <div>${formatTraitBadges(p.traits)}</div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${
                  lvOk
                    ? `
                      <button type="button" class="button ${isA ? "primary" : ""}" data-pick-a="${p.uid}">選為親代 A</button>
                      <button type="button" class="button ${isB ? "primary" : ""}" data-pick-b="${p.uid}">選為親代 B</button>
                    `
                    : `
                      <button type="button" class="button gold" data-boost-lv5="${p.uid}">
                        ⬆️ 強化至 Lv.5 解鎖合成
                      </button>
                    `
                }
              </div>
            </div>
          `;
        })
        .join("");

      bodyEl.innerHTML = `
        <div class="wallet" style="background:#f3e8ff;border-color:#a855f7;color:#581c87;">
          <span>🪙 訓練家金幣：₽ ${state.coins}（培育屋合成費：₽ 120 / 次 · 雙親保留不消失）</span>
          <span style="font-size:15px;">🧬 已合成新物種：${(state.customSpecies || []).length} 種</span>
        </div>

        ${eggHtml}

        <div class="nursery-workbench">
          ${renderSlotCard("🧬 親代 A", parentA)}
          <div style="font-size:28px;font-weight:900;color:#7e22ce;text-align:center;">✕</div>
          ${renderSlotCard("🧬 親代 B", parentB)}
        </div>

        ${previewHtml}

        <h3 style="font-size:17px;font-weight:900;color:#1e293b;margin-bottom:6px;">
          🐾 選擇親代寶可夢（目前符合 Lv.5+ 資格共 ${eligible.length} / ${allOwned.length} 隻）：
        </h3>
        <div class="catalog-list">${companionRows}</div>
      `;

      const hatchNowBtn = document.getElementById("btnHatchEggNow");
      if (hatchNowBtn) {
        hatchNowBtn.onclick = () => {
          const res = hatchCurrentEgg();
          if (res && res.childPoke) {
            showToast(`🐣 孵化成功！第 ${res.childPoke.generation} 代合成獸【${res.childPoke.name} Lv.${res.childPoke.level}】已加入隊伍！`);
            openMenuModal("nursery");
          }
        };
      }

      const nameInp = document.getElementById("inputHybridName");
      if (nameInp) {
        nameInp.oninput = (e) => {
          nurseryCustomName = e.target.value;
        };
      }

      const executeBreed = (instantHatch) => {
        if (!parentA || !parentB || parentA.uid === parentB.uid) return;
        if (state.coins < 120) {
          SFX.playWrong();
          showToast("⚠️ 金幣不足 ₽120！請先到道館答題或開啟地圖寶箱獲得金幣！");
          return;
        }
        const customVal = (document.getElementById("inputHybridName")?.value || nurseryCustomName || "").trim();
        const childSp = buildSynthesizedSpecies(parentA, parentB, customVal);
        state.coins -= 120;
        parentA.breedAfterStep = (state.steps || 0) + 32;
        parentB.breedAfterStep = (state.steps || 0) + 32;
        state.egg = {
          parentNames: [parentA.name, parentB.name],
          stepsRemaining: 32,
          childSpecies: childSp
        };
        nurseryCustomName = "";

        if (instantHatch) {
          const res = hatchCurrentEgg();
          if (res && res.childPoke) {
            showToast(
              `🎉 合成成功！第 ${res.childPoke.generation} 代合成寶可夢【${res.childPoke.name} Lv.${res.childPoke.level}】已加入你的${res.inParty ? "出戰隊伍" : "倉庫"}！`
            );
          }
        } else {
          SFX.playHeal();
          addJournalEntry(`🥚 在培育屋由【${parentA.name} × ${parentB.name}】獲得了合成精靈蛋！`);
          saveGame();
          updateAllHUD();
          showToast(`🥚 已領取【${childSp.name}】的合成蛋！在地圖走 32 步或點擊「立即孵化」即可誕生！`);
        }
        openMenuModal("nursery");
      };

      const btnInstant = document.getElementById("btnBreedInstant");
      if (btnInstant) btnInstant.onclick = () => executeBreed(true);
      const btnEgg = document.getElementById("btnBreedEgg");
      if (btnEgg) btnEgg.onclick = () => executeBreed(false);

      bodyEl.querySelectorAll("button[data-pick-a]").forEach((btn) => {
        btn.onclick = () => {
          const uid = btn.getAttribute("data-pick-a");
          if (nurserySelB === uid) nurserySelB = nurserySelA;
          nurserySelA = uid;
          SFX.playClick();
          openMenuModal("nursery");
        };
      });
      bodyEl.querySelectorAll("button[data-pick-b]").forEach((btn) => {
        btn.onclick = () => {
          const uid = btn.getAttribute("data-pick-b");
          if (nurserySelA === uid) nurserySelA = nurserySelB;
          nurserySelB = uid;
          SFX.playClick();
          openMenuModal("nursery");
        };
      });
      bodyEl.querySelectorAll("button[data-boost-lv5]").forEach((btn) => {
        btn.onclick = () => {
          const uid = btn.getAttribute("data-boost-lv5");
          const target = allOwned.find((p) => p.uid === uid);
          if (!target) return;
          const needLevels = Math.max(1, 5 - target.level);
          if ((state.items["exp-candy-s"] || 0) >= 1) {
            state.items["exp-candy-s"]--;
            gainPokemonExp(target, needLevels * 20, false);
            saveGame();
            updateAllHUD();
            showToast(`🍬 使用經驗糖果將【${target.name}】提升至 Lv.${target.level}，已解鎖培育屋合成資格！`);
            openMenuModal("nursery");
          } else if (state.coins >= 80) {
            state.coins -= 80;
            gainPokemonExp(target, needLevels * 20, false);
            saveGame();
            updateAllHUD();
            showToast(`⬆️ 消耗 ₽80 將【${target.name}】特訓升至 Lv.${target.level}，已解鎖合成資格！`);
            openMenuModal("nursery");
          } else {
            SFX.playWrong();
            showToast("⚠️ 請先去國語或數學道館答題升級，或在商店購買經驗糖果！");
          }
        };
      });
      return;
    }

    if (tab === "bag") {
      const ownedItems = DATA.shopItems.filter(
        (it) => (it.effect === "vehicle" && state.ownedBicycle) || (state.items[it.id] || 0) > 0
      );
      const luckyBonus = (state.items["lucky-egg"] || 0) * 25;
      const coinBonus = (state.items["amulet-coin"] || 0) * 50;
      const candyLvBonus = (state.items["rare-candy"] || 0) * 2;

      const bagCards = ownedItems
        .map((it) => {
          const count = it.effect === "vehicle" ? (state.ownedBicycle ? 1 : 0) : state.items[it.id] || 0;
          const maxCarry = it.maxCarry || 9;
          const orbClass = it.orbTheme || (it.tier >= 4 ? "gold-burst" : it.tier === 3 ? "epic-burst" : "mint");
          const fallbackUrl = getItemFallbackSvgUrl(it);
          const imgSrc = it.spriteUrl || fallbackUrl;

          let actionHtml = "";
          if (it.effect === "capture") {
            actionHtml = `
              <button type="button" class="pb-cta-btn shortfall" disabled style="background:#64748b;">
                <span>於野外／頭目對戰中投擲</span>
                <span class="pb-price-tag">持有 ×${count}</span>
              </button>
            `;
          } else if (it.effect === "amulet-coin") {
            actionHtml = `
              <button type="button" class="pb-cta-btn can-buy" disabled style="background:linear-gradient(135deg,#16a34a,#059669);cursor:default;">
                <span>✅ 被動生效中 (金幣 +${count * 50}%)</span>
                <span class="pb-price-tag">×${count}</span>
              </button>
            `;
          } else if (it.effect === "vehicle") {
            actionHtml = `
              <button type="button" class="pb-cta-btn can-buy" data-use-bag="${it.id}">
                <span>${state.ridingBicycle ? "🚲 切換為步行" : "🚲 立即騎乘腳踏車"}</span>
                <span class="pb-price-tag">160% 移速</span>
              </button>
            `;
          } else if (it.effect === "sweet-honey") {
            actionHtml = `
              <button type="button" class="pb-cta-btn can-buy" data-use-bag="${it.id}" style="background:linear-gradient(135deg,#d97706,#f59e0b);">
                <span>🍯 立即吸引區域頭目出沒</span>
                <span class="pb-price-tag">使用 ×1</span>
              </button>
            `;
          } else {
            actionHtml = `
              <button type="button" class="pb-cta-btn can-buy" data-use-bag="${it.id}">
                <span>✨ 對出戰隊長使用</span>
                <span class="pb-price-tag">剩餘 ×${count}</span>
              </button>
            `;
          }

          return `
            <div class="pb-item-card">
              <div>
                <div class="pb-card-top">
                  <div class="pb-orb ${orbClass}">
                    <img class="pb-sprite" src="${imgSrc}" onerror="this.onerror=null;this.src='${fallbackUrl}';" alt="${it.name}" />
                  </div>
                  <div class="pb-title-wrap">
                    <strong>${it.name}</strong>
                    <div class="pb-owned-line">
                      <span class="pb-rarity-dot" style="background:${it.dotColor || "#22c55e"};"></span>
                      <span>背包中有 ${count}/${maxCarry} 個</span>
                    </div>
                  </div>
                </div>
                <div class="pb-desc">${it.description}</div>
              </div>
              <div>
                <div class="pb-stock-pill">📦 目前持有：${count} 個</div>
                ${actionHtml}
              </div>
            </div>
          `;
        })
        .join("");

      bodyEl.innerHTML = `
        <div class="pb-shop-shell">
          <div class="pb-header-row">
            <div class="pb-green-banner">
              <strong>背包</strong>
              <span>檢視與使用你的冒險神器與補給道具</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <div class="pb-currency-pill" title="目前持有金幣">
                <span>🪙</span>
                <span>${state.coins}</span>
              </div>
              <button type="button" class="button gold" id="btnBagToShop" style="border-radius:999px;padding:7px 16px;">
                🏪 前往商店兌換道具
              </button>
            </div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
            <span style="background:rgba(34,197,94,0.18);border:1px solid #4ade80;color:#bbf7d0;padding:5px 12px;border-radius:999px;font-size:0.86rem;font-weight:800;">
              🍀 幸運蛋經驗加成：+${luckyBonus}%
            </span>
            <span style="background:rgba(250,204,21,0.18);border:1px solid #facc15;color:#fef08a;padding:5px 12px;border-radius:999px;font-size:0.86rem;font-weight:800;">
              🪙 護符金幣加成：+${coinBonus}%
            </span>
            <span style="background:rgba(96,165,250,0.18);border:1px solid #60a5fa;color:#bfdbfe;padding:5px 12px;border-radius:999px;font-size:0.86rem;font-weight:800;">
              🍬 神奇糖果收服等級加成：+${candyLvBonus} 級
            </span>
            ${
              state.repelSteps > 0
                ? `<span style="background:rgba(16,185,129,0.25);border:1px solid #34d399;color:#ecfdf5;padding:5px 12px;border-radius:999px;font-size:0.86rem;font-weight:800;">
                     🌿 除蟲噴霧剩餘：${state.repelSteps} 步
                   </span>`
                : ""
            }
          </div>

          <div class="pb-section-header">
            <span class="pb-section-dot"></span>
            <span>已擁有背包道具</span>
            <span class="pb-section-count">${ownedItems.length}</span>
          </div>

          ${
            ownedItems.length > 0
              ? `<div class="pb-cards-grid">${bagCards}</div>`
              : `<div style="background:rgba(255,255,255,0.08);border-radius:14px;padding:24px;text-align:center;color:#cbd5e1;font-weight:800;">
                   背包目前沒有道具，快點擊右上角「🏪 前往商店兌換道具」或去道館特訓賺取金幣吧！
                 </div>`
          }
        </div>
      `;

      document.getElementById("btnBagToShop").onclick = () => openMenuModal("shop");
      bodyEl.querySelectorAll("button[data-use-bag]").forEach((btn) => {
        btn.onclick = () => {
          const itemId = btn.getAttribute("data-use-bag");
          useBagItemOutOfBattle(itemId);
        };
      });
      return;
    }

    if (tab === "shop") {
      if (!state.shopPurchased) state.shopPurchased = {};

      const renderShopCard = (it) => {
        const ownedCount = it.effect === "vehicle" ? (state.ownedBicycle ? 1 : 0) : state.items[it.id] || 0;
        const maxStock = it.maxStock || 4;
        const maxCarry = it.maxCarry || 9;
        const boughtCount = it.effect === "vehicle" ? (state.ownedBicycle ? 1 : 0) : state.shopPurchased[it.id] || 0;
        const remainingStock = Math.max(0, maxStock - boughtCount);
        const curPrice = it.price + boughtCount * (it.priceStep || 0);
        const nextPrice = it.price + (boughtCount + 1) * (it.priceStep || 0);
        const canBuy = remainingStock > 0 && ownedCount < maxCarry && state.coins >= curPrice;
        const shortfall = Math.max(0, curPrice - (state.coins || 0));
        const orbClass = it.orbTheme || (it.tier >= 4 ? "gold-burst" : it.tier === 3 ? "epic-burst" : "mint");
        const fallbackUrl = getItemFallbackSvgUrl(it);
        const imgSrc = it.spriteUrl || fallbackUrl;

        let ctaBtnHtml = "";
        if (remainingStock <= 0 || ownedCount >= maxCarry) {
          ctaBtnHtml = `
            <button type="button" class="pb-cta-btn shortfall" disabled>
              <span>已達購買上限</span>
              <span class="pb-price-tag">✅ 已滿</span>
            </button>
          `;
        } else if (canBuy) {
          ctaBtnHtml = `
            <button type="button" class="pb-cta-btn can-buy" data-buy-id="${it.id}">
              <span>立即兌換</span>
              <span class="pb-price-tag">🪙 ${curPrice}</span>
            </button>
          `;
        } else {
          ctaBtnHtml = `
            <button type="button" class="pb-cta-btn shortfall" data-buy-id="${it.id}">
              <span>還差 ${shortfall}</span>
              <span class="pb-price-tag">🪙 ${curPrice}</span>
            </button>
          `;
        }

        return `
          <div class="pb-item-card">
            <div>
              <div class="pb-card-top">
                <div class="pb-orb ${orbClass}">
                  <img class="pb-sprite" src="${imgSrc}" onerror="this.onerror=null;this.src='${fallbackUrl}';" alt="${it.name}" />
                </div>
                <div class="pb-title-wrap">
                  <strong>${it.name}</strong>
                  <div class="pb-owned-line">
                    <span class="pb-rarity-dot" style="background:${it.dotColor || "#22c55e"};"></span>
                    <span>背包中有 ${ownedCount}/${maxCarry} 個</span>
                  </div>
                </div>
              </div>
              <div class="pb-desc">${it.description}</div>
            </div>

            <div>
              <div class="pb-stock-pill ${remainingStock <= 0 ? "sold-out" : ""}">
                ${remainingStock > 0 ? `還能購買 ${remainingStock} 個` : `今日已全數兌換完畢`}
              </div>
              <div class="pb-meta-row">
                <span>今日已購買：${boughtCount}/${maxStock}</span>
                <span>${remainingStock > 1 && it.priceStep ? `下一個：${nextPrice}` : `單價：${curPrice}`}</span>
              </div>
              ${ctaBtnHtml}
            </div>
          </div>
        `;
      };

      const backpackItems = DATA.shopItems.filter((it) => it.category === "backpack");
      const supplyItems = DATA.shopItems.filter((it) => it.category !== "backpack");

      bodyEl.innerHTML = `
        <div class="pb-shop-shell">
          <div class="pb-header-row">
            <div class="pb-green-banner">
              <strong>商店</strong>
              <span>用金幣兌換背包道具</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <button type="button" class="button" id="btnShopFreeHeal" style="border-radius:999px;background:#ecfdf5;color:#065f46;border-color:#10b981;font-size:0.9rem;padding:6px 14px;">
                💖 喬伊免費恢復全隊 HP
              </button>
              <div class="pb-currency-pill" title="透過國語道館、數學道館結算與地圖寶箱獲得金幣">
                <span>🪙</span>
                <span>${state.coins}</span>
              </div>
            </div>
          </div>

          <div class="pb-section-header">
            <span class="pb-section-dot" style="background:#22c55e;"></span>
            <span>背包</span>
            <span class="pb-section-count">${backpackItems.length}</span>
          </div>
          <div class="pb-cards-grid">
            ${backpackItems.map(renderShopCard).join("")}
          </div>

          <div class="pb-section-header">
            <span class="pb-section-dot" style="background:#38bdf8;box-shadow:0 0 8px #38bdf8;"></span>
            <span>精靈球、醫療補給與道館裝備</span>
            <span class="pb-section-count">${supplyItems.length}</span>
          </div>
          <div class="pb-cards-grid">
            ${supplyItems.map(renderShopCard).join("")}
          </div>
        </div>
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
      const fullCatalog = DATA.pokemonCatalog.filter((cat) => cat.id < 900);
      const codexHtml = fullCatalog
        .map((cat) => {
          const caught = state.caughtIds.includes(cat.id) || Boolean(cat.isHybrid);
          const regName = cat.isHybrid
            ? `🧬 培育屋合成（親代：${(cat.parentNames || []).join("×")}）`
            : cat.regionId === "starter"
            ? "初始夥伴"
            : DATA.regions[cat.regionId]?.name || cat.regionId;
          return `
          <div class="catalog-row" style="opacity:${caught ? "1" : "0.65"};background:${cat.isHybrid ? "#f3e8ff" : caught ? "#e8f5e9" : "#f1f5f9"};">
            <img src="${getPokemonDisplayUrl(cat, "portrait")}" onerror="this.src='${getPokemonFallbackUrl(cat, "portrait")}'" style="width:56px;height:56px;image-rendering:pixelated;object-fit:contain;border-radius:6px;border:2px solid #94a3b8;background:#fff;" />
            <div>
              <strong>
                #${cat.id4} ${cat.name} (${cat.enName})
                ${cat.isHybrid ? `<span class="gen-badge">第${cat.generation || 1}代合成獸</span>` : ""}
                ${caught ? "✅ 已收服" : "🔒 未收服"}
              </strong>
              <p>${cat.desc}</p>
              <small style="color:#1e40af;font-weight:800;">屬性：${cat.type} · 來源：${regName} (Lv.${cat.minLv}+) · 絕招：${cat.move}</small>
            </div>
          </div>
        `;
        })
        .join("");

      bodyEl.innerHTML = `
        <p style="margin-bottom:10px;font-weight:800;">
          📖 寶可夢圖鑑紀錄：<strong>已收服 ${state.caughtIds.length} / ${fullCatalog.length} 種</strong>（依金銀版既有寶可夢與等級進化）
        </p>
        <div class="catalog-list">${codexHtml}</div>
      `;
      return;
    }

    // ------------------------------------------------------------------------
    // Tab: 冒險排行榜與日誌 (RECORDS — 移植自 infinite-pokemon VarietyPanels.tsx)
    // ------------------------------------------------------------------------
    if (tab === "records") {
      const badgeCount = (state.badges.chinese ? 1 : 0) + (state.badges.math ? 1 : 0);
      const hybridCount = (state.customSpecies || []).length;
      const trainerWins = (state.defeatedTrainers || []).length + (state.defeatedGuardians || []).length;
      const playerScore =
        state.caughtIds.length * 100 +
        badgeCount * 300 +
        hybridCount * 220 +
        trainerWins * 150 +
        (state.atkBonus + state.defBonus) * 15;

      const rivalBoard = [
        { name: `${state.trainerName}（你）`, caught: state.caughtIds.length, hybrids: hybridCount, badges: badgeCount, score: playerScore, isMe: true },
        { name: "道館學長 小茂", caught: 14, hybrids: 2, badges: 2, score: 2680, isMe: false },
        { name: "培育家 小遙", caught: 11, hybrids: 4, badges: 2, score: 2420, isMe: false },
        { name: "巡護員 阿哲", caught: 9, hybrids: 1, badges: 1, score: 1650, isMe: false }
      ].sort((a, b) => b.score - a.score);

      const boardRows = rivalBoard
        .map(
          (r, i) => `
          <div class="catalog-row" style="background:${r.isMe ? "#fef9c3" : "#e8ecd8"};border-color:${r.isMe ? "#eab308" : "#a0b0a8"};">
            <div class="item-icon-box" style="font-weight:900;font-size:20px;background:${i === 0 ? "#fde047" : "#fff"};">#${i + 1}</div>
            <div>
              <strong>${r.name}</strong>
              <p>📖 圖鑑：${r.caught} 種 · 🧬 合成獸：${r.hybrids} 種 · 🏅 道館徽章：${r.badges} 枚</p>
            </div>
            <strong style="font-size:20px;color:#1e3a8a;">${r.score} 分</strong>
          </div>
        `
        )
        .join("");

      const journalHtml = (state.journal || [])
        .map((j) => `<div style="padding:6px 10px;border-bottom:1px solid #cbd5e1;font-size:15px;color:#334155;">• ${j}</div>`)
        .join("");

      bodyEl.innerHTML = `
        <h3 style="font-size:18px;font-weight:900;color:#1e293b;margin-bottom:8px;">🏆 柳溪谷榮譽訓練家排行榜：</h3>
        <div class="catalog-list" style="max-height:240px;margin-bottom:14px;">${boardRows}</div>
        <h3 style="font-size:18px;font-weight:900;color:#1e293b;margin-bottom:6px;">📜 最近冒險與合成日誌：</h3>
        <div style="background:#f8fafc;border:2px solid #cbd5e1;border-radius:6px;max-height:190px;overflow-y:auto;">
          ${journalHtml || `<div style="padding:10px;color:#64748b;">尚無紀錄</div>`}
        </div>
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
          <div style="background:#e8ecd8;padding:10px;border:2px solid #a0b0a8;">🧬 已合成新寶可夢：<strong>${(state.customSpecies || []).length} 種</strong></div>
          <div style="background:#fee2e2;padding:10px;border:2px solid #f87171;">⚔️ 國語文道館攻擊加成：<strong>+${state.atkBonus}</strong></div>
          <div style="background:#dbeafe;padding:10px;border:2px solid #60a5fa;">🛡️ 數學道館防禦加成：<strong>+${state.defBonus}</strong></div>
          <div style="background:#fef9c3;padding:10px;border:2px solid #facc15;">🪙 持有金幣：<strong>₽ ${state.coins}</strong></div>
          <div style="background:#f3e8ff;padding:10px;border:2px solid #c084fc;">🎁 已開啟地圖寶箱：<strong>${state.collectedChests.length} / 16</strong></div>
        </div>
        ${lead ? `<p style="font-size:16px;color:#334155;">目前出戰隊長：<strong>${lead.name} Lv.${lead.level}</strong>（⚔️ATK ${lead.atk} / 🛡️DEF ${lead.def} / HP ${lead.hp}/${lead.maxHp}）</p>` : ""}
      `;
      return;
    }

    if (tab === "save") {
      const lead = getLeadPokemon();
      const curReg = getCurrentRegion();

      const slotsHtml = SAVE_SLOT_KEYS.map((key, idx) => {
        let slotData = null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) slotData = JSON.parse(raw);
        } catch (e) {}

        const hasData = slotData && slotData.initialized && Array.isArray(slotData.party) && slotData.party.length > 0;
        const sLead = hasData ? slotData.party[slotData.activeIndex || 0] || slotData.party[0] : null;
        const sRegName = hasData ? (DATA.regions[slotData.regionId]?.name || "柳溪") : "";

        return `
          <div class="save-slot-card ${hasData ? "active-slot" : ""}">
            <div style="flex:1 1 260px;">
              <strong style="font-size:19px;color:#0f172a;">
                📁 存檔槽 ${idx + 1} ${hasData ? `— 訓練家【${slotData.trainerName}】` : "（空白存檔槽）"}
              </strong>
              ${
                hasData
                  ? `<div style="font-size:14px;color:#334155;font-weight:700;margin-top:4px;">
                       📍 位置：${sRegName} ｜ 🐾 隊長：${sLead ? `${sLead.name} Lv.${sLead.level}` : "無"}（共 ${slotData.party.length + (slotData.storage?.length || 0)} 隻）<br/>
                       ⚔️ 國語攻擊 +${slotData.atkBonus || 0} ｜ 🛡️ 數學防禦 +${slotData.defBonus || 0} ｜ 🪙 金幣 ₽${slotData.coins || 0} ｜ 🕒 存檔時間：${slotData.lastSavedAt || "未知"}
                     </div>`
                  : `<div style="font-size:14px;color:#64748b;margin-top:4px;">尚未儲存任何進度，點擊右側「存入此槽」即可保存。</div>`
              }
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="button primary" data-save-slot="${idx}">💾 存入此槽</button>
              <button type="button" class="button gold" data-load-slot="${idx}" ${!hasData ? "disabled" : ""}>📂 讀取進度</button>
              <button type="button" class="button danger" data-del-slot="${idx}" ${!hasData ? "disabled" : ""}>🗑️</button>
            </div>
          </div>
        `;
      }).join("");

      bodyEl.innerHTML = `
        <div style="background:#dcfce7;border:2px solid #22c55e;border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <strong style="font-size:19px;color:#14532d;">✅ 目前遊戲進度（本機自動存檔已啟用）</strong>
            <div style="font-size:14px;color:#166534;font-weight:700;margin-top:3px;">
              🧢 訓練家：${state.trainerName} ｜ 📍 地點：${curReg.name} ｜ 🐾 隊長：${lead ? `${lead.name} Lv.${lead.level}` : "無"} ｜ 🕒 最後存檔：${state.lastSavedAt || "剛剛"}
            </div>
          </div>
          <button type="button" class="button primary" id="btnQuickSaveNow" style="background:#15803d;border-color:#14532d;color:#fff;">
            💾 立即手動存檔
          </button>
          <button type="button" class="button danger" id="btnStartFreshGame" style="background:#fff1f2;color:#be123c;border-color:#fb7185;">
            🆕 開始全新冒險
          </button>
        </div>

        <h3 style="font-size:18px;font-weight:900;color:#1e293b;margin-bottom:6px;">🗂️ 多重存檔槽（可為不同同學或不同階段保存進度）：</h3>
        <div class="save-slots-grid">${slotsHtml}</div>

        <div style="margin-top:14px;padding:12px 14px;background:#f1f5f9;border:2px solid #cbd5e1;border-radius:8px;">
          <strong style="font-size:16px;color:#1e293b;">🔄 跨裝置備份與還原（下載存檔檔案 / 匯入存檔檔案）：</strong>
          <p style="font-size:14px;color:#475569;margin:4px 0 10px;">
            若要在不同平板或電腦之間轉移進度，可點擊「下載存檔檔 (.json)」，之後在另一台裝置點擊「讀取存檔檔」即可完整恢復！
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <button type="button" class="button" id="btnExportSaveFile">📤 下載存檔檔案 (.json)</button>
            <label class="button primary" style="cursor:pointer;margin:0;">
              📥 讀取存檔檔案 (.json)
              <input type="file" id="inputImportSaveFile" accept=".json,application/json" style="display:none;" />
            </label>
          </div>
        </div>
      `;

      document.getElementById("btnQuickSaveNow").onclick = () => {
        saveGame(true);
        openMenuModal("save");
      };

      document.getElementById("btnStartFreshGame").onclick = () => {
        if (!confirm("確定要清除這台裝置上的目前進度與存檔槽，重新選擇初始寶可夢嗎？此操作無法復原。")) return;
        try {
          localStorage.removeItem(SAVE_KEY);
          SAVE_SLOT_KEYS.forEach((key) => localStorage.removeItem(key));
        } catch (e) {}
        location.reload();
      };

      bodyEl.querySelectorAll("button[data-save-slot]").forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.getAttribute("data-save-slot"), 10);
          saveToSlot(idx);
          openMenuModal("save");
        };
      });

      bodyEl.querySelectorAll("button[data-load-slot]").forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.getAttribute("data-load-slot"), 10);
          if (loadFromSlot(idx)) {
            modal.classList.add("hidden");
          }
        };
      });

      bodyEl.querySelectorAll("button[data-del-slot]").forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.getAttribute("data-del-slot"), 10);
          if (confirm(`確定要清除「存檔槽 ${idx + 1}」的進度紀錄嗎？`)) {
            deleteSlot(idx);
            openMenuModal("save");
          }
        };
      });

      document.getElementById("btnExportSaveFile").onclick = () => {
        saveGame(false);
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `寶可夢訓練道館_${state.trainerName}_存檔.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("📤 已下載存檔檔案 (.json)！");
      };

      const fileInput = document.getElementById("inputImportSaveFile");
      if (fileInput) {
        fileInput.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const parsed = JSON.parse(ev.target.result);
              if (parsed && parsed.initialized && Array.isArray(parsed.party) && parsed.party.length > 0) {
                state = Object.assign(getDefaultState(), parsed);
                state.party = (state.party || []).map(ensurePokemonFields);
                state.storage = (state.storage || []).map(ensurePokemonFields);
                saveGame(false);
                camX = state.x * TILE_SIZE;
                camY = state.y * TILE_SIZE;
                SFX.playHeal();
                updateAllHUD();
                modal.classList.add("hidden");
                showToast(`🎉 成功匯入訓練家【${state.trainerName}】的冒險進度！`);
              } else {
                alert("存檔檔案格式不正確！");
              }
            } catch (err) {
              alert("無法讀取該存檔檔案，請確認是否為有效的 .json 存檔！");
            }
          };
          reader.readAsText(file);
        };
      }
      return;
    }
  }

  function buyShopItem(itemId) {
    const item = DATA.shopItems.find((it) => it.id === itemId);
    if (!item) return;
    if (!state.shopPurchased) state.shopPurchased = {};

    const maxStock = item.maxStock || 4;
    const maxCarry = item.maxCarry || 9;
    const boughtCount = item.effect === "vehicle" ? (state.ownedBicycle ? 1 : 0) : state.shopPurchased[item.id] || 0;
    const ownedCount = item.effect === "vehicle" ? (state.ownedBicycle ? 1 : 0) : state.items[item.id] || 0;
    const curPrice = item.price + boughtCount * (item.priceStep || 0);

    if (boughtCount >= maxStock || ownedCount >= maxCarry) {
      SFX.playWrong();
      showToast(`⚠️ 【${item.name}】已達購買或背包攜帶上限！`);
      return;
    }

    if (state.coins < curPrice) {
      SFX.playWrong();
      showToast(`⚠️ 金幣還差 ₽${curPrice - state.coins}！快去國語或數學道館完成練習結算領取豐厚金幣！`);
      return;
    }

    state.coins -= curPrice;
    state.shopPurchased[item.id] = boughtCount + 1;
    SFX.playChest();

    if (item.effect === "vehicle") {
      state.ownedBicycle = true;
      state.ridingBicycle = true;
      showToast("🚲 恭喜兌換【越野腳踏車】！現在你在戶外地圖的移動速度提升至 160%！");
    } else if (item.effect === "atk-boost") {
      state.items[itemId] = (state.items[itemId] || 0) + 1;
      showToast(`⚔️ 已取得【${item.name}】；攻擊力只能透過國語文道館訓練提升。`);
    } else if (item.effect === "def-boost") {
      state.items[itemId] = (state.items[itemId] || 0) + 1;
      showToast(`🛡️ 已取得【${item.name}】；防禦力只能透過數學道館訓練提升。`);
    } else if (item.effect === "rare-candy") {
      state.items[itemId] = (state.items[itemId] || 0) + 1;
      const lead = getLeadPokemon();
      if (lead) {
        gainPokemonExp(lead, (lead.xpToNext || 20) * 2, false);
      }
      showToast(`🍬 兌換【神奇糖果】×1！出戰隊長立即連升 2 級，且後續新收服寶可夢開局額外 +2 級！`);
    } else {
      state.items[itemId] = (state.items[itemId] || 0) + 1;
      showToast(`🛍️ 成功兌換【${item.name}】×1！（剩餘金幣 ₽${state.coins}）`);
    }
    saveGame();
    updateAllHUD();
  }

  function useBagItemOutOfBattle(itemId) {
    const item = DATA.shopItems.find((it) => it.id === itemId);
    if (!item) return;

    if (item.effect === "vehicle") {
      if (!state.ownedBicycle) return;
      state.ridingBicycle = !state.ridingBicycle;
      SFX.playClick();
      saveGame();
      updateAllHUD();
      openMenuModal("bag");
      showToast(state.ridingBicycle ? "🚲 已騎上越野腳踏車（移動速度 160%）！" : "👟 已切換為步行模式。");
      return;
    }

    if ((state.items[itemId] || 0) <= 0) return;
    const lead = getLeadPokemon();
    if (!lead) return;
    ensurePokemonFields(lead);

    if (item.effect === "sweet-honey") {
      state.items[itemId]--;
      saveGame();
      updateAllHUD();
      document.getElementById("menuModal").classList.add("hidden");
      showToast("🍯 甜甜蜜散發出濃郁香氣！成功吸引本區域的【頭目寶可夢】出沒！");
      startGuardianBattle({ id: "honey-alpha", name: `${getCurrentRegion().name.split(" ")[0]}頭目` });
      return;
    }

    state.items[itemId]--;
    SFX.playHeal();

    if (item.effect === "heal") {
      lead.hp = Math.min(lead.maxHp, lead.hp + item.power);
      showToast(`💖 對【${lead.name}】使用了${item.name}，恢復 ${item.power} HP！`);
    } else if (item.effect === "rare-candy") {
      const res = gainPokemonExp(lead, (lead.xpToNext || 20) * 2, false);
      showToast(`🍬 使用【神奇糖果】！【${lead.name}】連升 2 級至 Lv.${lead.level}（HP+${res.totalHpGain}/ATK+${res.totalAtkGain}/DEF+${res.totalDefGain}）！`);
    } else if (item.effect === "lucky-egg") {
      const res = gainPokemonExp(lead, 30, false);
      showToast(`🥚 使用【幸運蛋】能量！【${lead.name}】獲得 +${res.expGain} EXP（升至 Lv.${lead.level}）！`);
    } else if (item.effect === "exp-candy") {
      const res = gainPokemonExp(lead, item.power || 20, false);
      showToast(`🍬 餵食【${item.name}】！【${lead.name}】升上了 Lv.${lead.level}（HP+${res.totalHpGain}/ATK+${res.totalAtkGain}/DEF+${res.totalDefGain}）！`);
    } else if (item.effect === "breakthrough") {
      lead.breakthroughStage = (lead.breakthroughStage || 0) + 1;
      lead.level += 1;
      lead.maxHp += 20;
      lead.hp = lead.maxHp;
      lead.atk += 6;
      lead.def += 6;
      if (!lead.name.includes("★")) lead.name = `${lead.name}★`;
      SFX.playHatch();
      showToast(`🌟 【${lead.name}】使用覺醒之石完成突破進化！全能力大幅提升！`);
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
    openMenuModal("bag");
  }


  // --------------------------------------------------------------------------
  // 隨機抽題工具函式（每次進入道館或切換難度皆重新隨機抽取指定題數）
  // --------------------------------------------------------------------------
  function shuffleArray(arr) {
    const copy = Array.isArray(arr) ? [...arr] : [];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function sampleQuestions(pool, count) {
    const shuffled = shuffleArray(pool).slice(0, Math.min(count, pool.length));
    return shuffled.map((item) => {
      const clone = JSON.parse(JSON.stringify(item));
      if (Array.isArray(clone.options)) {
        clone.options = shuffleArray(clone.options);
      }
      if (Array.isArray(clone.questions)) {
        clone.questions = clone.questions.map((qObj) => {
          if (Array.isArray(qObj.options) && typeof qObj.answer === "number") {
            const correctText = qObj.options[qObj.answer];
            const newOpts = shuffleArray(qObj.options);
            return {
              ...qObj,
              options: newOpts,
              answer: newOpts.indexOf(correctText)
            };
          }
          return qObj;
        });
      }
      return clone;
    });
  }

  // --------------------------------------------------------------------------
  // 道館進度條與結算共用輔助函式
  // --------------------------------------------------------------------------
  function createEmptyTierStats() {
    return {
      atk: 0,
      def: 0,
      hp: 0,
      coins: 0,
      mistakes: 0,
      bonusClaimed: false,
      items: []
    };
  }

  function findNextUnansweredIndex(doneSet, currentIdx, total) {
    for (let offset = 1; offset <= total; offset++) {
      const candidate = (currentIdx + offset) % total;
      if (!doneSet.has(candidate)) return candidate;
    }
    return currentIdx;
  }

  function buildGymProgressStripHtml(gymType, tier, curIdx, total, doneSet) {
    const doneCount = doneSet ? doneSet.size : 0;
    const tierNameMap = {
      a: `初階（目標 ${total} 題）`,
      b: `中階（目標 ${total} 題）`,
      c: `進階（目標 ${total} 題）`
    };
    let dotsHtml = "";
    for (let i = 0; i < total; i++) {
      const isDone = doneSet && doneSet.has(i);
      const isCurrent = i === curIdx;
      const cls = ["gym-step-dot", isDone ? "done" : "", isCurrent ? "current" : ""]
        .filter(Boolean)
        .join(" ");
      dotsHtml += `<span class="${cls}" data-step-idx="${i}" style="cursor:pointer;" title="點擊前往第 ${i + 1} 題">${
        isDone ? "✓" : i + 1
      }</span>`;
    }
    const allDoneBtn =
      doneCount >= total
        ? `<button type="button" class="btn-pixel" id="btnViewSettlementNow" style="padding:4px 12px;font-size:0.82rem;">🏆 查看結算畫面</button>`
        : "";

    return `
      <div class="gym-progress-strip">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:900;color:${gymType === "chinese" ? "#882818" : "#184078"};">
            📊 ${tierNameMap[tier] || ""}進度：已完成 <strong>${doneCount} / ${total}</strong> 題
          </span>
          <span style="font-size:0.8rem;font-weight:800;color:#64748b;">
            （做完 ${total} 題自動進入結算畫面！）
          </span>
          ${allDoneBtn}
        </div>
        <div class="gym-step-dots" id="gymStepDotsBar">${dotsHtml}</div>
      </div>
    `;
  }

  function bindGymProgressStripEvents(container, gymType, tier, onSelectIdx) {
    if (!container) return;
    container.querySelectorAll("#gymStepDotsBar .gym-step-dot").forEach((dot) => {
      dot.onclick = () => {
        const idx = parseInt(dot.getAttribute("data-step-idx"), 10);
        if (!isNaN(idx)) {
          SFX.playClick();
          onSelectIdx(idx);
        }
      };
    });
    const settleBtn = container.querySelector("#btnViewSettlementNow");
    if (settleBtn) {
      settleBtn.onclick = () => {
        SFX.playClick();
        if (gymType === "chinese") renderChineseSettlement(tier);
        else renderMathSettlement(tier);
      };
    }
  }

  // --------------------------------------------------------------------------
  // 國語文道館（南一版第 1~6 課 & 題庫卷）— 提升攻擊力 ATK
  // (a) 初階（10 題）：第 1~6 課生字聽寫手寫練習（無任何候選字選項，完全親手書寫） -> 做完 10 題出現結算畫面
  // (b) 中階（8 題）：題庫精選（改錯字、多音字、選詞填寫、部首字形、修辭、課文理解） -> 練習完 8 題出現結算畫面
  // (c) 進階（5 題）：閱讀測驗理解 -> 練習完 5 題出現結算畫面
  // --------------------------------------------------------------------------
  let chState = {
    tier: "a",
    qIndexA: 0,
    qIndexB: 0,
    qIndexC: 0,
    poolA: [],
    poolB: [],
    poolC: [],
    done: { a: new Set(), b: new Set(), c: new Set() },
    stats: {
      a: createEmptyTierStats(),
      b: createEmptyTierStats(),
      c: createEmptyTierStats()
    },
    advanceTimer: null,
    recognizedChars: [],
    candidateLists: [],
    strokeCounts: [],
    strokeLengths: [],
    showRadicalHint: false,
    showStrokeHint: false
  };

  function clearChineseAdvanceTimer() {
    if (chState.advanceTimer) {
      clearTimeout(chState.advanceTimer);
      chState.advanceTimer = null;
    }
  }

  function resampleChineseTier(tier) {
    clearChineseAdvanceTimer();
    if (tier === "a") {
      chState.poolA = sampleQuestions(DATA.chineseGym.dictationQuestions || [], 10);
      chState.qIndexA = 0;
      chState.done.a = new Set();
      chState.stats.a = createEmptyTierStats();
    } else if (tier === "b") {
      const midSource = DATA.chineseGym.middleQuestions || DATA.chineseGym.sentenceQuestions || [];
      chState.poolB = sampleQuestions(midSource, 8);
      chState.qIndexB = 0;
      chState.done.b = new Set();
      chState.stats.b = createEmptyTierStats();
    } else if (tier === "c") {
      chState.poolC = sampleQuestions(DATA.chineseGym.readingQuestions || [], 5);
      chState.qIndexC = 0;
      chState.done.c = new Set();
      chState.stats.c = createEmptyTierStats();
    }
  }

  function openChineseGym(defaultTier = null) {
    SFX.playClick();
    clearChineseAdvanceTimer();
    if (defaultTier) chState.tier = defaultTier;
    document.getElementById("chineseGymModal").classList.remove("hidden");
    // 每次進入皆重新隨機抽題並重置該輪進度
    resampleChineseTier("a");
    resampleChineseTier("b");
    resampleChineseTier("c");
    switchChineseTier(chState.tier, false);
  }

  function switchChineseTier(tier, shouldResample = true) {
    clearChineseAdvanceTimer();
    chState.tier = tier;
    if (shouldResample) {
      resampleChineseTier(tier);
    }
    ["a", "b", "c"].forEach((t) => {
      const btn = document.getElementById(`chTab_${t}`);
      if (btn) {
        btn.classList.toggle("active", t === tier);
        btn.classList.toggle("active-chinese", t === tier);
        btn.classList.toggle("active-math", false);
      }
    });
    if (tier === "a") renderChineseDictation();
    else if (tier === "b") renderChineseMiddle();
    else renderChineseReading();
  }

  function handleChineseQuestionCompleted(tier, qIdx, totalCount, atkBonus, qId, reviewTitle, reviewDetail, renderNextFn) {
    clearChineseAdvanceTimer();
    const doneSet = chState.done[tier];
    const st = chState.stats[tier];
    const isFirstTimeThisSession = !doneSet.has(qIdx);

    if (isFirstTimeThisSession) {
      doneSet.add(qIdx);
      const gainInfo = rewardChineseTraining(atkBonus, qId);
      st.atk += gainInfo.atkGain;
      st.coins += gainInfo.coinGain;
      st.items.push({
        num: qIdx + 1,
        title: reviewTitle,
        detail: reviewDetail,
        reward: `⚔️ATK +${gainInfo.atkGain} · 🪙₽${gainInfo.coinGain}`
      });
    }

    // 更新上方進度點點
    const dotEl = document.querySelector(`#chineseGymBody #gymStepDotsBar .gym-step-dot[data-step-idx="${qIdx}"]`);
    if (dotEl) {
      dotEl.classList.add("done");
      dotEl.textContent = "✓";
    }

    if (doneSet.size >= totalCount) {
      // 已完成本階全部題數（初階 10 題 / 中階 8 題 / 進階 5 題）-> 進入結算畫面！
      chState.advanceTimer = setTimeout(() => {
        renderChineseSettlement(tier);
      }, 850);
      return true;
    } else {
      // 自動跳往下一題未作答題目
      const nextIdx = findNextUnansweredIndex(doneSet, qIdx, totalCount);
      chState.advanceTimer = setTimeout(() => {
        renderNextFn(nextIdx);
      }, tier === "c" ? 1300 : 1050);
      return false;
    }
  }

  function renderChineseSettlement(tier) {
    clearChineseAdvanceTimer();
    const container = document.getElementById("chineseGymBody");
    if (!container) return;

    const totalMap = { a: 10, b: 8, c: 5 };
    const titleMap = {
      a: "初階・第 1~6 課生字聽寫特訓（10 題全數完成！）",
      b: "中階・國語文綜合題庫測驗（8 題全數完成！）",
      c: "進階・國語文閱讀素養測驗（5 篇全數完成！）"
    };
    const bonusCoinMap = { a: 150, b: 200, c: 280 };
    const bonusItemMap = {
      a: { key: "poke-ball", name: "精靈球 ×1" },
      b: { key: "great-ball", name: "超級球 ×1" },
      c: { key: "rare-candy", name: "神奇糖果 ×1" }
    };

    const st = chState.stats[tier];
    const totalCount = totalMap[tier] || 10;
    const bonusItem = bonusItemMap[tier];
    const extraCoins = Math.round((bonusCoinMap[tier] || 150) * getCoinMultiplier());

    if (!st.bonusClaimed) {
      st.bonusClaimed = true;
      state.coins = (state.coins || 0) + extraCoins;
      st.coins += extraCoins;
      if (bonusItem) {
        state.items[bonusItem.key] = (state.items[bonusItem.key] || 0) + 1;
      }
      addJournalEntry(`完成【國語文道館・${titleMap[tier]}】，獲得結算獎勵 ₽${extraCoins} 與 ${bonusItem.name}！`);
      saveGame();
      updateAllHUD();
      SFX.playGymComplete();
    }

    const lead = getLeadPokemon();
    const accuracy = Math.max(
      60,
      Math.round((totalCount / Math.max(totalCount, totalCount + st.mistakes)) * 100)
    );
    const stars = st.mistakes <= 1 ? "⭐⭐⭐" : st.mistakes <= 4 ? "⭐⭐☆" : "⭐☆☆";

    const reviewRowsHtml = st.items
      .map(
        (it) => `
        <div class="gym-review-row">
          <div>
            <span class="badge-ok">第 ${it.num} 題</span>
            <strong style="margin-left:6px;color:#1e293b;">${it.title}</strong>
            <span style="margin-left:8px;color:#475569;font-size:0.84rem;">${it.detail}</span>
          </div>
          <div style="font-size:0.82rem;color:#b45309;font-weight:900;">${it.reward}</div>
        </div>
      `
      )
      .join("");

    const nextTier = tier === "a" ? "b" : tier === "b" ? "c" : null;
    const nextTierLabel = tier === "a" ? "⏭️ 挑戰中階（8 題）" : tier === "b" ? "⏭️ 挑戰進階（5 題）" : "";

    container.innerHTML = `
      <div class="gym-settlement-card">
        <div class="gym-settlement-header">
          <div class="gym-settlement-trophy">🏆</div>
          <div style="font-size:1.4rem;letter-spacing:2px;margin:2px 0;">${stars}</div>
          <h3 class="gym-settlement-title">🎊 國語文道館・階段結算報告 🎊</h3>
          <p class="gym-settlement-sub">${titleMap[tier]}</p>
        </div>

        ${
          lead
            ? `
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;background:#fff8ed;border:2px solid #f5d08a;border-radius:14px;padding:10px 18px;margin-bottom:14px;">
            <img src="${getSpriteUrl(lead.id)}" alt="${lead.name}" style="width:68px;height:68px;image-rendering:pixelated;" />
            <div style="text-align:left;">
              <div style="font-weight:900;font-size:1.08rem;color:#7c2d12;">
                出戰夥伴：【${lead.name}】 Lv.${lead.level}
              </div>
              <div style="font-size:0.88rem;font-weight:800;color:#9a3412;">
                目前攻擊力：⚔️ ${lead.atk}　｜　通關額外大禮：🪙 +₽${extraCoins}、🎁 ${bonusItem ? bonusItem.name : ""}
              </div>
            </div>
          </div>
        `
            : ""
        }

        <div class="gym-settlement-stats-grid">
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">✅ 完成題數</div>
            <div class="gym-settlement-stat-val">${totalCount} / ${totalCount} 題</div>
          </div>
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">🎯 答題正確率</div>
            <div class="gym-settlement-stat-val" style="color:#15803d;">${accuracy}%</div>
          </div>
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">⚔️ 累計攻擊提升</div>
            <div class="gym-settlement-stat-val" style="color:#b91c1c;">+${st.atk} ATK</div>
          </div>
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">🪙 本輪總獲金幣</div>
            <div class="gym-settlement-stat-val" style="color:#b45309;">+₽${st.coins.toLocaleString()}</div>
          </div>
        </div>

        <div class="gym-review-list">
          <div style="font-weight:900;color:#334155;margin-bottom:6px;font-size:0.92rem;">
            📝 本輪完成題目與學習重點一覽（共 ${st.items.length} 題）：
          </div>
          ${reviewRowsHtml}
        </div>

        <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:18px;">
          <button type="button" class="btn-pixel" id="btnSettleRetryCh" style="padding:10px 18px;font-size:0.98rem;">
            🎲 再練習一輪（重新抽 ${totalCount} 題）
          </button>
          ${
            nextTier
              ? `<button type="button" class="btn-pixel-lg" id="btnSettleNextCh" style="padding:10px 22px;font-size:1rem;">${nextTierLabel}</button>`
              : ""
          }
          <button type="button" class="hud-btn" id="btnSettleOpenShopCh" style="padding:10px 16px;font-size:0.95rem;background:#fef3c7;color:#92400e;border-color:#f59e0b;">
            🏪 前往商店兌換道具
          </button>
          <button type="button" class="hud-btn" id="btnSettleCloseCh" style="padding:10px 16px;font-size:0.95rem;">
            🗺️ 返回寶可夢地圖
          </button>
        </div>
      </div>
    `;

    document.getElementById("btnSettleRetryCh").onclick = () => {
      SFX.playClick();
      resampleChineseTier(tier);
      switchChineseTier(tier, false);
    };
    const nextBtn = document.getElementById("btnSettleNextCh");
    if (nextBtn && nextTier) {
      nextBtn.onclick = () => {
        SFX.playClick();
        resampleChineseTier(nextTier);
        switchChineseTier(nextTier, false);
      };
    }
    document.getElementById("btnSettleOpenShopCh").onclick = () => {
      SFX.playClick();
      document.getElementById("chineseGymModal").classList.add("hidden");
      openMenuModal("shop");
    };
    document.getElementById("btnSettleCloseCh").onclick = () => {
      SFX.playClick();
      document.getElementById("chineseGymModal").classList.add("hidden");
    };
  }

  // --- (a) 初階（10 題）：第 1~6 課語音聽寫生字（純手寫，絕不顯示候選字選項） ---
  function renderChineseDictation() {
    clearChineseAdvanceTimer();
    if (!chState.poolA || chState.poolA.length === 0) {
      resampleChineseTier("a");
    }
    const list = chState.poolA;
    const curIdx = chState.qIndexA % list.length;
    const q = list[curIdx];
    const container = document.getElementById("chineseGymBody");
    const chars = Array.from(q.word);
    chState.recognizedChars = chars.map(() => "");
    chState.candidateLists = chars.map(() => []);
    chState.strokeCounts = chars.map(() => 0);
    chState.strokeLengths = chars.map(() => 0);
    chState.showRadicalHint = false;
    chState.showStrokeHint = false;

    const radicalText = (q.radicals || [])
      .map((r, i) => `第 ${i + 1} 字部首：【${r}】`)
      .join("　｜　");
    const strokeHintText = (q.firstStrokes || [])
      .map((s, i) => {
        const sc = q.strokeCounts && q.strokeCounts[i] ? `（共 ${q.strokeCounts[i]} 畫）` : "";
        return `第 ${i + 1} 字第一筆畫：【${s}】${sc}`;
      })
      .join("　｜　");

    const progressStripHtml = buildGymProgressStripHtml("chinese", "a", curIdx, list.length, chState.done.a);

    container.innerHTML = `
      <div class="dictation-panel">
        ${progressStripHtml}
        <div class="voice-prompt-bar">
          <div>
            <span class="brand-badge" style="background:#b83828">${q.lesson}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">第 ${curIdx + 1} / ${list.length} 題 · 生字聽寫手寫特訓（共 ${chars.length} 字）</strong>
            <div style="margin-top:6px;font-size:0.95rem;color:#485868;font-weight:700;">
              🎧 請按「播放語音出題」聽取題目；畫面不顯示答案提示。
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="voice-play-btn" id="btnPlayDictationVoice">
              🔊 播放語音出題
            </button>
            <button type="button" class="hud-btn" id="btnResampleChA" title="重新從題庫隨機抽取 10 題">
              🎲 重新隨機抽 10 題
            </button>
          </div>
        </div>

        <div style="text-align:center;font-weight:800;color:#882820;font-size:0.96rem;background:#fff5f2;padding:8px 12px;border-radius:8px;border:1px solid #f0c8c0;">
          ✍️ 請直接用手指、觸控筆或滑鼠在下方空白田字格內<strong>親手寫出國字</strong>（本模式不提供選字按鈕，考驗真實手寫實力！）：
        </div>

        <div class="tianzige-row" id="tianzigeRow" style="margin-top:12px;"></div>

        <!-- 僅提供部首與筆畫文字提示，絕不出現任何候選國字選項供點選 -->
        <div style="margin-top:14px;padding:12px 16px;background:#fdf8ec;border:2px solid #d8c8a8;border-radius:10px;">
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;">
            <span style="font-weight:900;color:#684828;font-size:0.95rem;">💡 忘記怎麼寫嗎？可查看筆畫與部首提示：</span>
            <button type="button" class="hud-btn" id="btnHintRadical" style="background:#fff3d6;color:#7c4d12;border-color:#c8963e;font-weight:900;">
              1. 部首提示
            </button>
            <button type="button" class="hud-btn" id="btnHintFirstStroke" style="background:#eef6ff;color:#1e4e8c;border-color:#5a90d6;font-weight:900;">
              2. 筆畫提示（起筆與總筆畫）
            </button>
          </div>
          <div id="hintRadicalBox" style="display:none;margin-top:10px;padding:8px 12px;background:#fff9eb;border-left:4px solid #d89028;font-weight:800;color:#683810;text-align:center;">
            🔍 <strong>部首提示：</strong>${radicalText}
          </div>
          <div id="hintStrokeBox" style="display:none;margin-top:8px;padding:8px 12px;background:#f0f7ff;border-left:4px solid #3878c8;font-weight:800;color:#183868;text-align:center;">
            ✏️ <strong>筆畫提示：</strong>${strokeHintText}
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px;padding-top:12px;border-top:2px dashed #d8ceb8;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-weight:800;">手寫進度：</span>
            <div id="dictationResultSlots" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="hud-btn" id="btnPrevDictation">⬅️ 上一題</button>
            <button type="button" class="btn-pixel-lg" id="btnSubmitDictation" style="padding:8px 20px;font-size:1.05rem;">
              ✅ 批改手寫國字 (攻擊力 +${q.atkBonus})
            </button>
            <button type="button" class="hud-btn" id="btnNextDictation">下一題 ➡️</button>
          </div>
        </div>
        <div id="dictationFeedback" style="margin-top:12px;font-weight:800;font-size:1.08rem;"></div>
      </div>
    `;

    bindGymProgressStripEvents(container, "chinese", "a", (idx) => {
      chState.qIndexA = idx;
      renderChineseDictation();
    });

    const rowEl = document.getElementById("tianzigeRow");
    const slotsEl = document.getElementById("dictationResultSlots");

    chars.forEach((targetChar, idx) => {
      const slot = document.createElement("div");
      slot.className = "recognized-slot";
      slot.id = `recSlot_${idx}`;
      slot.style.minWidth = "72px";
      slot.style.padding = "4px 10px";
      slot.style.fontSize = "0.9rem";
      slot.textContent = "待手寫";
      slotsEl.appendChild(slot);

      const unit = document.createElement("div");
      unit.className = "tianzige-unit";
      unit.innerHTML = `
        <div style="font-weight:900;color:#882820;">第 ${idx + 1} 字（共 ${chars.length} 字）</div>
        <div class="tianzige-box">
          <canvas class="handwrite-canvas" id="hwCanvas_${idx}" width="220" height="220"></canvas>
        </div>
        <div id="hwStatus_${idx}" style="font-size:0.84rem;font-weight:800;color:#586878;min-height:22px;text-align:center;">
          ✍️ 請在格內手寫第 ${idx + 1} 個字
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="hud-btn" id="clearHw_${idx}" style="font-size:0.82rem;padding:4px 10px;">🧹 擦掉重寫</button>
        </div>
      `;
      rowEl.appendChild(unit);

      setupHandwritingCanvas(idx, targetChar);
    });

    document.getElementById("btnPlayDictationVoice").onclick = () => {
      SFX.speak(q.voicePrompt);
    };
    document.getElementById("btnResampleChA").onclick = () => {
      SFX.playClick();
      resampleChineseTier("a");
      renderChineseDictation();
      showToast("🎲 已重新隨機抽取 10 題第 1~6 課生字聽寫題！");
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
      checkDictationAnswer(q, curIdx, list.length);
    };

    setTimeout(() => SFX.speak(q.voicePrompt), 250);
  }

  // 田字格手寫與背景筆跡辨識引擎（不顯示任何候選字供學生點選）
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
      chState.strokeCounts[idx] = strokes.length;
      chState.strokeLengths[idx] = Math.round(strokeLength);

      const statusEl = document.getElementById(`hwStatus_${idx}`);
      if (statusEl) {
        statusEl.style.color = "#1e4e8c";
        statusEl.textContent = `🖊️ 已手寫 ${strokes.length} 筆畫`;
      }
      const slot = document.getElementById(`recSlot_${idx}`);
      if (slot) {
        slot.textContent = `已寫 ${strokes.length} 畫`;
        slot.classList.remove("correct");
      }

      if (recogTimer) clearTimeout(recogTimer);
      recogTimer = setTimeout(() => {
        recognizeChineseInk(idx, strokes, targetChar);
      }, 320);
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
      chState.strokeCounts[idx] = 0;
      chState.strokeLengths[idx] = 0;
      chState.recognizedChars[idx] = "";
      chState.candidateLists[idx] = [];
      const statusEl = document.getElementById(`hwStatus_${idx}`);
      if (statusEl) {
        statusEl.style.color = "#788898";
        statusEl.textContent = `🧹 已清除，請重新手寫第 ${idx + 1} 字`;
      }
      const slot = document.getElementById(`recSlot_${idx}`);
      if (slot) {
        slot.textContent = "待手寫";
        slot.classList.remove("correct");
      }
    };
  }

  async function recognizeChineseInk(idx, strokes, targetChar) {
    if (!strokes || strokes.length === 0) return;

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
            max_num_results: 12,
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
        const cands = data[1][0][1] || [];
        chState.candidateLists[idx] = cands;
        if (targetChar && cands.includes(targetChar)) {
          chState.recognizedChars[idx] = targetChar;
        } else if (cands[0]) {
          chState.recognizedChars[idx] = cands[0];
        }
        return;
      }
    } catch (e) {
      // 離線或網路無法連線至辨識服務時，保留筆畫數供離線批改輔助
    }
  }

  function checkDictationAnswer(q, curIdx = 0, totalCount = 10) {
    const chars = Array.from(q.word);
    const fb = document.getElementById("dictationFeedback");

    const unwrittenIdx = chars.findIndex((_, i) => (chState.strokeCounts[i] || 0) < 2);
    if (unwrittenIdx !== -1) {
      SFX.playWrong();
      if (fb) {
        fb.style.color = "#c83028";
        fb.innerHTML = `⚠️ 第 <strong>${unwrittenIdx + 1}</strong> 個田字格還沒有寫完喔！請在每個田字格內親手寫出國字再按批改。`;
      }
      return;
    }

    let allCorrect = true;
    const detailMsgs = [];

    chars.forEach((targetChar, idx) => {
      const slot = document.getElementById(`recSlot_${idx}`);
      const statusEl = document.getElementById(`hwStatus_${idx}`);
      const cands = chState.candidateLists[idx] || [];
      const recChar = chState.recognizedChars[idx] || "";
      const writtenStrokes = chState.strokeCounts[idx] || 0;
      const expectedStrokes = (q.strokeCounts && q.strokeCounts[idx]) || 0;

      const isOnlineMatched = recChar === targetChar || cands.includes(targetChar);
      const isOfflineFallbackMatched =
        cands.length === 0 &&
        expectedStrokes > 0 &&
        Math.abs(writtenStrokes - expectedStrokes) <= 2 &&
        (chState.strokeLengths[idx] || 0) >= 180;

      if (isOnlineMatched || isOfflineFallbackMatched) {
        if (slot) {
          slot.textContent = `✅ ${targetChar}`;
          slot.classList.add("correct");
        }
        if (statusEl) {
          statusEl.style.color = "#187838";
          statusEl.textContent = `✅ 第 ${idx + 1} 字手寫正確！`;
        }
      } else {
        allCorrect = false;
        if (slot) {
          slot.textContent = recChar ? `❌ 辨識為「${recChar}」` : `❌ 筆畫不符`;
          slot.classList.remove("correct");
        }
        if (statusEl) {
          statusEl.style.color = "#c83028";
          statusEl.textContent = recChar
            ? `⚠️ 看起像「${recChar}」，請擦掉重寫`
            : `⚠️ 字形不夠端正（已寫 ${writtenStrokes} 畫）`;
        }
        detailMsgs.push(
          `第 ${idx + 1} 字（已寫 ${writtenStrokes} 畫${expectedStrokes ? `，正確為 ${expectedStrokes} 畫` : ""}）`
        );
      }
    });

    if (allCorrect) {
      SFX.playCorrect();
      SFX.speak(`太棒了！你親手寫出了「${q.word}」！寶可夢攻擊力提升 ${q.atkBonus} 點！`);
      const isAllDone = handleChineseQuestionCompleted(
        "a",
        curIdx,
        totalCount,
        q.atkBonus,
        q.id,
        `【${q.lesson}】${q.word}`,
        q.voicePrompt,
        (nextIdx) => {
          chState.qIndexA = nextIdx;
          renderChineseDictation();
        }
      );
      if (fb) {
        fb.style.color = "#187838";
        fb.innerHTML = isAllDone
          ? `🎊 批改通過！已完成初階全部 ${totalCount} 題生字聽寫！即將進入結算畫面...`
          : `🎉 批改通過！你親手寫出了工整的「<strong>${q.word}</strong>」！出戰寶可夢【攻擊力 +${q.atkBonus}】！（已完成 ${chState.done.a.size}/${totalCount} 題，即將前往下一題...）`;
      }
    } else {
      SFX.playWrong();
      chState.stats.a.mistakes++;
      if (fb) {
        fb.style.color = "#c83028";
        fb.innerHTML = `⚠️ ${detailMsgs.join("、")} 還不太正確喔！請參考「1. 部首提示」與「2. 筆畫提示」，擦掉後再端正手寫一次！`;
      }
    }
  }

  // --- (b) 中階（8 題）：題庫精選（改錯字、多音字、選詞填寫、部首字形、修辭、課文理解） ---
  function renderChineseMiddle() {
    clearChineseAdvanceTimer();
    if (!chState.poolB || chState.poolB.length === 0) {
      resampleChineseTier("b");
    }
    const list = chState.poolB;
    const curIdx = chState.qIndexB % list.length;
    const q = list[curIdx];
    const container = document.getElementById("chineseGymBody");

    const progressStripHtml = buildGymProgressStripHtml("chinese", "b", curIdx, list.length, chState.done.b);

    const optsHtml = (q.options || [])
      .map(
        (opt, oIdx) =>
          `<button type="button" class="quiz-option-btn" data-val="${opt}">(${
            ["A", "B", "C", "D"][oIdx] || oIdx + 1
          }) ${opt}</button>`
      )
      .join("");

    container.innerHTML = `
      <div class="dictation-panel">
        ${progressStripHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#b83828">${q.lesson || "三上國語題庫"}</span>
            <span class="brand-badge" style="background:#7a4218;margin-left:4px;">${q.type || "綜合測驗"}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">第 ${curIdx + 1} / ${list.length} 題</strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="voice-play-btn" id="btnSpeakChMiddle" style="padding:6px 14px;font-size:0.92rem;">
              🔊 朗讀題目
            </button>
            <button type="button" class="hud-btn" id="btnResampleChB" title="重新從題庫隨機抽取 8 題">
              🎲 重新隨機抽 8 題
            </button>
          </div>
        </div>

        <div style="margin-top:14px;padding:16px;background:#fffef8;border:2px solid #d8c4a0;border-left:6px solid #c84828;border-radius:8px;font-size:1.16rem;font-weight:900;line-height:1.7;color:#1e2d38;">
          ${q.question}
        </div>

        <div class="quiz-options-list" id="chMiddleOpts" style="margin-top:14px;">
          ${optsHtml}
        </div>

        <div id="chMiddleFeedback" style="margin-top:12px;font-weight:800;font-size:1.05rem;min-height:28px;"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px;padding-top:12px;border-top:2px dashed #d8ceb8;">
          <button type="button" class="hud-btn" id="btnPrevChMiddle">⬅️ 上一題</button>
          <span style="font-weight:800;color:#882818;">⚔️ 答對獎勵：出戰寶可夢【攻擊力 +${q.atkBonus || 6}】（完成 8 題進入結算）</span>
          <button type="button" class="hud-btn" id="btnNextChMiddle">下一題 ➡️</button>
        </div>
      </div>
    `;

    bindGymProgressStripEvents(container, "chinese", "b", (idx) => {
      chState.qIndexB = idx;
      renderChineseMiddle();
    });

    container.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.onclick = () => {
        const val = btn.getAttribute("data-val");
        const fb = document.getElementById("chMiddleFeedback");
        container.querySelectorAll(".quiz-option-btn").forEach((b) => b.classList.remove("correct", "wrong"));

        if (val === q.answer) {
          SFX.playCorrect();
          btn.classList.add("correct");
          const isAllDone = handleChineseQuestionCompleted(
            "b",
            curIdx,
            list.length,
            q.atkBonus || 6,
            q.id,
            `【${q.type || "綜合"}】正解：${q.answer}`,
            q.question.slice(0, 32) + (q.question.length > 32 ? "..." : ""),
            (nextIdx) => {
              chState.qIndexB = nextIdx;
              renderChineseMiddle();
            }
          );
          if (fb) {
            fb.style.color = "#187838";
            fb.innerHTML = isAllDone
              ? `🎊 答對了！正確答案是「<strong>${q.answer}</strong>」！已完成中階全部 ${list.length} 題，即將進入結算畫面...`
              : `🎉 答對了！正確答案是「<strong>${q.answer}</strong>」！（已完成 ${chState.done.b.size}/${list.length} 題）<br><small>💡 解析：${q.explanation || ""}（寶可夢攻擊力 +${q.atkBonus || 6}！）</small>`;
          }
        } else {
          SFX.playWrong();
          chState.stats.b.mistakes++;
          btn.classList.add("wrong");
          if (fb) {
            fb.style.color = "#c83028";
            fb.innerHTML = `⚠️ 再想一想喔！<br><small>💡 提示：${q.explanation || "請仔細比對字形、讀音與前後文意。"}</small>`;
          }
        }
      };
    });

    document.getElementById("btnSpeakChMiddle").onclick = () => {
      SFX.speak(q.question);
    };
    document.getElementById("btnResampleChB").onclick = () => {
      SFX.playClick();
      resampleChineseTier("b");
      renderChineseMiddle();
      showToast("🎲 已從國語題庫重新隨機抽取 8 題中階題目！");
    };
    document.getElementById("btnPrevChMiddle").onclick = () => {
      chState.qIndexB = (chState.qIndexB - 1 + list.length) % list.length;
      renderChineseMiddle();
    };
    document.getElementById("btnNextChMiddle").onclick = () => {
      chState.qIndexB = (chState.qIndexB + 1) % list.length;
      renderChineseMiddle();
    };
  }

  // --- (c) 進階（5 題）：閱讀測驗活動 ---
  function renderChineseReading() {
    clearChineseAdvanceTimer();
    if (!chState.poolC || chState.poolC.length === 0) {
      resampleChineseTier("c");
    }
    const list = chState.poolC;
    const curIdx = chState.qIndexC % list.length;
    const item = list[curIdx];
    const container = document.getElementById("chineseGymBody");

    const progressStripHtml = buildGymProgressStripHtml("chinese", "c", curIdx, list.length, chState.done.c);

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
        ${progressStripHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#b83828">${item.lesson}</span>
            <strong style="font-size:1.18rem;margin-left:8px;">第 ${curIdx + 1} / ${list.length} 篇 · ${item.title}</strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="voice-play-btn" id="btnSpeakReading" style="padding:6px 14px;font-size:0.95rem;">
              🔊 語音朗讀短文
            </button>
            <button type="button" class="hud-btn" id="btnResampleChC" title="重新從題庫隨機抽取 5 篇閱讀測驗">
              🎲 重新隨機抽 5 篇
            </button>
          </div>
        </div>

        <div style="margin-top:12px;padding:16px;background:#fffef8;border:2px solid #c8bca0;border-radius:8px;font-size:1.12rem;line-height:1.75;white-space:pre-line;color:#202c38;">${item.passage}</div>

        ${qHtml}

        <div id="chReadingOverallFeedback" style="margin-top:12px;font-weight:900;font-size:1.05rem;"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px;">
          <button type="button" class="hud-btn" id="btnPrevReading">⬅️ 上一篇</button>
          <span style="font-weight:800;color:#882818;">全部答對可獲【攻擊力 +${item.atkBonus}】（練習完 5 篇即進入結算畫面！）</span>
          <button type="button" class="hud-btn" id="btnNextReading">下一篇 ➡️</button>
        </div>
      </div>
    `;

    bindGymProgressStripEvents(container, "chinese", "c", (idx) => {
      chState.qIndexC = idx;
      renderChineseReading();
    });

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
            const overallFb = document.getElementById("chReadingOverallFeedback");
            const isAllDone = handleChineseQuestionCompleted(
              "c",
              curIdx,
              list.length,
              item.atkBonus,
              item.id,
              `【${item.lesson}】${item.title}`,
              `完成 ${item.questions.length} 道閱讀理解題`,
              (nextIdx) => {
                chState.qIndexC = nextIdx;
                renderChineseReading();
              }
            );
            if (overallFb) {
              overallFb.style.color = "#15803d";
              overallFb.innerHTML = isAllDone
                ? `🎊 太厲害了！已完成進階全部 ${list.length} 篇閱讀測驗！即將進入結算畫面...`
                : `🎉 本篇閱讀測驗全部答對！（已完成 ${chState.done.c.size}/${list.length} 篇，即將前往下一篇...）`;
            }
          }
        } else {
          SFX.playWrong();
          chState.stats.c.mistakes++;
          btn.classList.add("wrong");
          expEl.style.color = "#c83028";
          expEl.innerHTML = `❌ 再想一想喔！請仔細閱讀短文中的線索。`;
        }
      };
    });

    document.getElementById("btnSpeakReading").onclick = () => {
      SFX.speak(item.passage);
    };
    document.getElementById("btnResampleChC").onclick = () => {
      SFX.playClick();
      resampleChineseTier("c");
      renderChineseReading();
      showToast("🎲 已重新隨機抽取 5 篇閱讀測驗！");
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
    const baseCoin = atkBonus >= 7 ? 100 : atkBonus >= 5 ? 70 : 50;
    const coinGain = Math.round(baseCoin * getCoinMultiplier());
    if (!lead) return { atkGain: atkBonus, coinGain };

    state.atkBonus = (state.atkBonus || 0) + atkBonus;
    state.coins = (state.coins || 0) + coinGain;

    state.party.forEach((p, i) => {
      ensurePokemonFields(p);
      const gain = i === state.activeIndex ? atkBonus : Math.max(2, Math.round(atkBonus * 0.7));
      p.atk += gain;
      p.atkTrained = (p.atkTrained || 0) + gain;
      p.maxHp += 6;
      p.hp = p.maxHp;
      gainPokemonExp(p, p.xpToNext || 20, false);
    });
    state.storage.forEach((p) => {
      ensurePokemonFields(p);
      const gain = Math.max(2, Math.round(atkBonus * 0.5));
      p.atk += gain;
      gainPokemonExp(p, p.xpToNext || 20, false);
    });

    state.chineseScore = (state.chineseScore || 0) + 10;
    if (qId && !state.completedQuestions.includes(qId)) {
      state.completedQuestions.push(qId);
    }
    if (state.chineseScore >= 30 && !state.badges.chinese) {
      state.badges.chinese = true;
      state.items["great-ball"] = (state.items["great-ball"] || 0) + 2;
      addJournalEntry(`獲得【國語道館・文采徽章】！全隊升級且攻擊力提升 +${atkBonus}！`);
      showToast(`🏅 恭喜獲得【國語道館・文采徽章】！全隊升級 Lv+1、攻擊+${atkBonus}、金幣+₽${coinGain}、超級球×2！`);
    } else {
      showToast(`📕 國語道館特訓成功！【${lead.name}】升至 Lv.${lead.level}，攻擊力 +${atkBonus}（現為 ${lead.atk}），獲得金幣 ₽${coinGain}！`);
    }
    saveGame();
    updateAllHUD();
    return { atkGain: atkBonus, coinGain };
  }

  // --------------------------------------------------------------------------
  // 數學道館（三上第 1~4 單元 & 題庫卷）— 提升防禦力 DEF 與 HP
  // (a) 初階（10 題）：千位數的加減運算為主（直式計算板 ＋ 手寫數字辨識） -> 做完 10 題出現結算畫面
  // (b) 中階（8 題）：選擇題或填空題為主（參考題庫：位值化聚、比大小、毫米、乘法、角） -> 練習完 8 題出現結算畫面
  // (c) 進階（5 題）：應用題為主（參考題庫素養與兩步驟應用題） -> 練習完 5 題出現結算畫面
  // --------------------------------------------------------------------------
  let maState = {
    tier: "a",
    qIndexA: 0,
    qIndexB: 0,
    qIndexC: 0,
    poolA: [],
    poolB: [],
    poolC: [],
    done: { a: new Set(), b: new Set(), c: new Set() },
    stats: {
      a: createEmptyTierStats(),
      b: createEmptyTierStats(),
      c: createEmptyTierStats()
    },
    advanceTimer: null,
    verticalDigits: ["", "", "", ""], // 千、百、十、個
    activeDigitCol: 3 // 預設從「個位」(index 3) 開始算起
  };

  function clearMathAdvanceTimer() {
    if (maState.advanceTimer) {
      clearTimeout(maState.advanceTimer);
      maState.advanceTimer = null;
    }
  }

  function resampleMathTier(tier) {
    clearMathAdvanceTimer();
    if (tier === "a") {
      maState.poolA = sampleQuestions(DATA.mathGym.verticalQuestions || [], 10);
      maState.qIndexA = 0;
      maState.done.a = new Set();
      maState.stats.a = createEmptyTierStats();
    } else if (tier === "b") {
      const midSource = DATA.mathGym.middleQuestions || DATA.mathGym.basicQuestions || [];
      maState.poolB = sampleQuestions(midSource, 8);
      maState.qIndexB = 0;
      maState.done.b = new Set();
      maState.stats.b = createEmptyTierStats();
    } else if (tier === "c") {
      maState.poolC = sampleQuestions(DATA.mathGym.wordProblems || [], 5);
      maState.qIndexC = 0;
      maState.done.c = new Set();
      maState.stats.c = createEmptyTierStats();
    }
  }

  function openMathGym(defaultTier = null) {
    SFX.playClick();
    clearMathAdvanceTimer();
    if (defaultTier) maState.tier = defaultTier;
    document.getElementById("mathGymModal").classList.remove("hidden");
    // 每次進入皆重新隨機抽題並重置該輪進度
    resampleMathTier("a");
    resampleMathTier("b");
    resampleMathTier("c");
    switchMathTier(maState.tier, false);
  }

  function switchMathTier(tier, shouldResample = true) {
    clearMathAdvanceTimer();
    maState.tier = tier;
    if (shouldResample) {
      resampleMathTier(tier);
    }
    ["a", "b", "c"].forEach((t) => {
      const btn = document.getElementById(`maTab_${t}`);
      if (btn) {
        btn.classList.toggle("active", t === tier);
        btn.classList.toggle("active-chinese", false);
        btn.classList.toggle("active-math", t === tier);
      }
    });
    if (tier === "a") renderMathVertical();
    else if (tier === "b") renderMathMiddle();
    else renderMathWordProblem();
  }

  function handleMathQuestionCompleted(tier, qIdx, totalCount, defBonus, qId, reviewTitle, reviewDetail, renderNextFn) {
    clearMathAdvanceTimer();
    const doneSet = maState.done[tier];
    const st = maState.stats[tier];
    const isFirstTimeThisSession = !doneSet.has(qIdx);

    if (isFirstTimeThisSession) {
      doneSet.add(qIdx);
      const gainInfo = rewardMathTraining(defBonus, qId);
      st.def += gainInfo.defGain;
      st.hp += gainInfo.hpGain;
      st.coins += gainInfo.coinGain;
      st.items.push({
        num: qIdx + 1,
        title: reviewTitle,
        detail: reviewDetail,
        reward: `🛡️DEF +${gainInfo.defGain} · ❤️HP +${gainInfo.hpGain} · 🪙₽${gainInfo.coinGain}`
      });
    }

    const dotEl = document.querySelector(`#mathGymBody #gymStepDotsBar .gym-step-dot[data-step-idx="${qIdx}"]`);
    if (dotEl) {
      dotEl.classList.add("done");
      dotEl.textContent = "✓";
    }

    if (doneSet.size >= totalCount) {
      // 已完成本階全部題數（初階 10 題 / 中階 8 題 / 進階 5 題）-> 進入結算畫面！
      maState.advanceTimer = setTimeout(() => {
        renderMathSettlement(tier);
      }, 850);
      return true;
    } else {
      const nextIdx = findNextUnansweredIndex(doneSet, qIdx, totalCount);
      maState.advanceTimer = setTimeout(() => {
        renderNextFn(nextIdx);
      }, tier === "c" ? 1300 : 1050);
      return false;
    }
  }

  function renderMathSettlement(tier) {
    clearMathAdvanceTimer();
    const container = document.getElementById("mathGymBody");
    if (!container) return;

    const totalMap = { a: 10, b: 8, c: 5 };
    const titleMap = {
      a: "初階・千位數加減直式特訓（10 題全數完成！）",
      b: "中階・數學觀念選擇與填空（8 題全數完成！）",
      c: "進階・生活素養應用題挑戰（5 題全數完成！）"
    };
    const bonusCoinMap = { a: 150, b: 200, c: 280 };
    const bonusItemMap = {
      a: { key: "poke-ball", name: "精靈球 ×1" },
      b: { key: "great-ball", name: "超級球 ×1" },
      c: { key: "rare-candy", name: "神奇糖果 ×1" }
    };

    const st = maState.stats[tier];
    const totalCount = totalMap[tier] || 10;
    const bonusItem = bonusItemMap[tier];
    const extraCoins = Math.round((bonusCoinMap[tier] || 150) * getCoinMultiplier());

    if (!st.bonusClaimed) {
      st.bonusClaimed = true;
      state.coins = (state.coins || 0) + extraCoins;
      st.coins += extraCoins;
      if (bonusItem) {
        state.items[bonusItem.key] = (state.items[bonusItem.key] || 0) + 1;
      }
      addJournalEntry(`完成【數學道館・${titleMap[tier]}】，獲得結算獎勵 ₽${extraCoins} 與 ${bonusItem.name}！`);
      saveGame();
      updateAllHUD();
      SFX.playGymComplete();
    }

    const lead = getLeadPokemon();
    const accuracy = Math.max(
      60,
      Math.round((totalCount / Math.max(totalCount, totalCount + st.mistakes)) * 100)
    );
    const stars = st.mistakes <= 1 ? "⭐⭐⭐" : st.mistakes <= 4 ? "⭐⭐☆" : "⭐☆☆";

    const reviewRowsHtml = st.items
      .map(
        (it) => `
        <div class="gym-review-row">
          <div>
            <span class="badge-ok">第 ${it.num} 題</span>
            <strong style="margin-left:6px;color:#1e293b;">${it.title}</strong>
            <span style="margin-left:8px;color:#475569;font-size:0.84rem;">${it.detail}</span>
          </div>
          <div style="font-size:0.82rem;color:#1d4ed8;font-weight:900;">${it.reward}</div>
        </div>
      `
      )
      .join("");

    const nextTier = tier === "a" ? "b" : tier === "b" ? "c" : null;
    const nextTierLabel = tier === "a" ? "⏭️ 挑戰中階（8 題）" : tier === "b" ? "⏭️ 挑戰進階（5 題）" : "";

    container.innerHTML = `
      <div class="gym-settlement-card">
        <div class="gym-settlement-header math-theme">
          <div class="gym-settlement-trophy">🏆</div>
          <div style="font-size:1.4rem;letter-spacing:2px;margin:2px 0;">${stars}</div>
          <h3 class="gym-settlement-title">🎊 數學道館・階段結算報告 🎊</h3>
          <p class="gym-settlement-sub">${titleMap[tier]}</p>
        </div>

        ${
          lead
            ? `
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;background:#eff6ff;border:2px solid #93c5fd;border-radius:14px;padding:10px 18px;margin-bottom:14px;">
            <img src="${getSpriteUrl(lead.id)}" alt="${lead.name}" style="width:68px;height:68px;image-rendering:pixelated;" />
            <div style="text-align:left;">
              <div style="font-weight:900;font-size:1.08rem;color:#1e3a8a;">
                出戰夥伴：【${lead.name}】 Lv.${lead.level}
              </div>
              <div style="font-size:0.88rem;font-weight:800;color:#1d4ed8;">
                目前防禦力：🛡️ ${lead.def} · 最大HP：❤️ ${lead.maxHp}　｜　通關大禮：🪙 +₽${extraCoins}、🎁 ${bonusItem ? bonusItem.name : ""}
              </div>
            </div>
          </div>
        `
            : ""
        }

        <div class="gym-settlement-stats-grid">
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">✅ 完成題數</div>
            <div class="gym-settlement-stat-val">${totalCount} / ${totalCount} 題</div>
          </div>
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">🎯 答題正確率</div>
            <div class="gym-settlement-stat-val" style="color:#15803d;">${accuracy}%</div>
          </div>
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">🛡️ 防禦與HP提升</div>
            <div class="gym-settlement-stat-val" style="color:#1d4ed8;">+${st.def} DEF / +${st.hp} HP</div>
          </div>
          <div class="gym-settlement-stat-box">
            <div class="gym-settlement-stat-label">🪙 本輪總獲金幣</div>
            <div class="gym-settlement-stat-val" style="color:#b45309;">+₽${st.coins.toLocaleString()}</div>
          </div>
        </div>

        <div class="gym-review-list">
          <div style="font-weight:900;color:#334155;margin-bottom:6px;font-size:0.92rem;">
            📝 本輪完成題目與算式紀錄（共 ${st.items.length} 題）：
          </div>
          ${reviewRowsHtml}
        </div>

        <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:18px;">
          <button type="button" class="btn-pixel" id="btnSettleRetryMa" style="padding:10px 18px;font-size:0.98rem;">
            🎲 再練習一輪（重新抽 ${totalCount} 題）
          </button>
          ${
            nextTier
              ? `<button type="button" class="btn-pixel-lg" id="btnSettleNextMa" style="background:#2563eb;padding:10px 22px;font-size:1rem;">${nextTierLabel}</button>`
              : ""
          }
          <button type="button" class="hud-btn" id="btnSettleOpenShopMa" style="padding:10px 16px;font-size:0.95rem;background:#fef3c7;color:#92400e;border-color:#f59e0b;">
            🏪 前往商店兌換道具
          </button>
          <button type="button" class="hud-btn" id="btnSettleCloseMa" style="padding:10px 16px;font-size:0.95rem;">
            🗺️ 返回寶可夢地圖
          </button>
        </div>
      </div>
    `;

    document.getElementById("btnSettleRetryMa").onclick = () => {
      SFX.playClick();
      resampleMathTier(tier);
      switchMathTier(tier, false);
    };
    const nextBtn = document.getElementById("btnSettleNextMa");
    if (nextBtn && nextTier) {
      nextBtn.onclick = () => {
        SFX.playClick();
        resampleMathTier(nextTier);
        switchMathTier(nextTier, false);
      };
    }
    document.getElementById("btnSettleOpenShopMa").onclick = () => {
      SFX.playClick();
      document.getElementById("mathGymModal").classList.add("hidden");
      openMenuModal("shop");
    };
    document.getElementById("btnSettleCloseMa").onclick = () => {
      SFX.playClick();
      document.getElementById("mathGymModal").classList.add("hidden");
    };
  }

  // --- (a) 初階（10 題）：千位數的加減運算（直式呈現 ＋ 平板手寫直式計算） ---
  function renderMathVertical() {
    clearMathAdvanceTimer();
    if (!maState.poolA || maState.poolA.length === 0) {
      resampleMathTier("a");
    }
    const list = maState.poolA;
    const curIdx = maState.qIndexA % list.length;
    const q = list[curIdx];
    maState.verticalDigits = ["", "", "", ""];
    maState.activeDigitCol = 3; // 從個位開始算起

    const d1 = String(q.num1).padStart(4, " ").split("");
    const d2 = String(q.num2).padStart(4, " ").split("");

    const progressStripHtml = buildGymProgressStripHtml("math", "a", curIdx, list.length, maState.done.a);

    const container = document.getElementById("mathGymBody");
    container.innerHTML = `
      <div class="dictation-panel">
        ${progressStripHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#285898">${q.unit}</span>
            <strong style="font-size:1.15rem;margin-left:8px;">千位數加減直式特訓（第 ${curIdx + 1} / ${list.length} 題）</strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="hud-btn" id="btnRandomVertical" style="font-size:0.88rem;">🎲 重新隨機抽 10 題</button>
          </div>
        </div>

        <p style="margin:10px 0;font-size:1.08rem;font-weight:800;color:#203040;">📖 題目：${q.story}</p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px;align-items:start;">
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
              <button type="button" class="hud-btn" id="btnClearCurrentCell" style="font-size:0.82rem;">⌫ 清除此格</button>
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

    bindGymProgressStripEvents(container, "math", "a", (idx) => {
      maState.qIndexA = idx;
      renderMathVertical();
    });

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

    const clearCellBtn = document.getElementById("btnClearCurrentCell");
    if (clearCellBtn) {
      clearCellBtn.onclick = () => {
        SFX.playClick();
        maState.verticalDigits[maState.activeDigitCol] = "";
        updateVerticalCellsUI();
      };
    }

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

    setupMathDigitCanvas(updateVerticalCellsUI);

    document.getElementById("btnPrevVertical").onclick = () => {
      maState.qIndexA = (maState.qIndexA - 1 + list.length) % list.length;
      renderMathVertical();
    };
    document.getElementById("btnNextVertical").onclick = () => {
      maState.qIndexA = (maState.qIndexA + 1) % list.length;
      renderMathVertical();
    };
    document.getElementById("btnRandomVertical").onclick = () => {
      SFX.playClick();
      resampleMathTier("a");
      renderMathVertical();
      showToast("🎲 已重新隨機抽取 10 題千位數加減運算題！");
    };

    document.getElementById("btnCheckVertical").onclick = () => {
      const targetStr = String(q.answer).padStart(4, "0");
      let allMatch = true;
      for (let i = 0; i < 4; i++) {
        const cell = document.getElementById(`vCell_${i}`);
        const userVal = maState.verticalDigits[i];
        const isLeadingZeroMatch = i === 0 && targetStr[0] === "0" && (userVal === "" || userVal === "0");
        if (userVal === targetStr[i] || isLeadingZeroMatch) {
          cell.classList.add("correct-cell");
        } else {
          cell.classList.remove("correct-cell");
          allMatch = false;
        }
      }

      const fb = document.getElementById("verticalFeedback");
      if (allMatch) {
        SFX.playCorrect();
        const isAllDone = handleMathQuestionCompleted(
          "a",
          curIdx,
          list.length,
          q.defBonus,
          q.id,
          `${q.num1} ${q.op} ${q.num2} = ${q.answer}`,
          q.unit,
          (nextIdx) => {
            maState.qIndexA = nextIdx;
            renderMathVertical();
          }
        );
        fb.style.color = "#187838";
        fb.innerHTML = isAllDone
          ? `🎊 直式計算完全正確！已完成初階全部 ${list.length} 題千位數加減！即將進入結算畫面...`
          : `🎉 直式計算完全正確！${q.num1} ${q.op} ${q.num2} ＝ <strong>${q.answer}</strong>！（已完成 ${maState.done.a.size}/${list.length} 題，即將前往下一題...）<br><small>🛡️ 寶可夢防禦力 +${q.defBonus}、最大 HP +${Math.round(q.defBonus * 3)}！</small>`;
      } else {
        SFX.playWrong();
        maState.stats.a.mistakes++;
        fb.style.color = "#c83028";
        fb.innerHTML = `⚠️ 還有位數算錯或沒填完喔！（綠色代表該位數正確）<br>💡 提示：${q.hint}`;
      }
    };
  }

  function fillVerticalDigit(digitStr, refreshFn) {
    maState.verticalDigits[maState.activeDigitCol] = digitStr;
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

  // --- (b) 中階（8 題）：題庫選擇題與填空題（10000以內的數、毫米、乘法、角） ---
  function renderMathMiddle() {
    clearMathAdvanceTimer();
    if (!maState.poolB || maState.poolB.length === 0) {
      resampleMathTier("b");
    }
    const list = maState.poolB;
    const curIdx = maState.qIndexB % list.length;
    const q = list[curIdx];
    const container = document.getElementById("mathGymBody");
    const isFill = q.qType === "fill" || !Array.isArray(q.options) || q.options.length === 0;

    const progressStripHtml = buildGymProgressStripHtml("math", "b", curIdx, list.length, maState.done.b);

    let answerAreaHtml = "";
    if (isFill) {
      answerAreaHtml = `
        <div style="margin-top:14px;padding:14px;background:#ffffff;border:2px solid #88a8d8;border-radius:10px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label for="mathFillInput" style="font-weight:900;color:#183868;font-size:1.05rem;">✏️ 請填入答案：</label>
            <input type="text" id="mathFillInput" inputmode="numeric" placeholder="輸入數字答案"
              style="font-size:1.25rem;font-weight:900;padding:8px 14px;width:180px;border:3px solid #3868b8;border-radius:8px;text-align:center;color:#182c48;" />
            ${q.unitLabel ? `<span style="font-weight:900;font-size:1.1rem;color:#284878;">${q.unitLabel}</span>` : ""}
            <button type="button" class="btn-pixel-lg" id="btnSubmitMathFill" style="background:#2868c8;padding:8px 20px;font-size:1rem;">
              ✅ 檢查填空答案
            </button>
          </div>
          <div style="margin-top:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:0.85rem;font-weight:800;color:#586878;">平板快捷數字鍵：</span>
            <div id="mathFillNumpad" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
          </div>
        </div>
      `;
    } else {
      const optsHtml = q.options
        .map(
          (opt, idx) =>
            `<button type="button" class="quiz-option-btn" data-val="${opt}">(${
              ["A", "B", "C", "D"][idx] || idx + 1
            }) ${opt}</button>`
        )
        .join("");
      answerAreaHtml = `<div class="quiz-options-list" id="mathBasicOpts" style="margin-top:14px;">${optsHtml}</div>`;
    }

    container.innerHTML = `
      <div class="dictation-panel">
        ${progressStripHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#285898">${q.unit}</span>
            <span class="brand-badge" style="background:${isFill ? "#1e7868" : "#485898"};margin-left:4px;">${
      isFill ? "✏️ 填充題" : "🔘 選擇題"
    }</span>
            <strong style="font-size:1.15rem;margin-left:8px;">第 ${curIdx + 1} / ${list.length} 題</strong>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:800;color:#2058a8;">🛡️ 防禦力 +${q.defBonus}（練習完 8 題進入結算）</span>
            <button type="button" class="hud-btn" id="btnResampleMaB" style="font-size:0.86rem;">🎲 重新隨機抽 8 題</button>
          </div>
        </div>

        <div style="margin-top:12px;padding:16px;background:#f0f6ff;border:2px solid #78a0d8;border-radius:8px;font-size:1.2rem;font-weight:900;white-space:pre-line;color:#182c48;">${q.question}</div>

        ${answerAreaHtml}

        <div class="scratchpad-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.88rem;font-weight:800;color:#486078;">✏️ 平板手寫計算草稿紙（可在下方空白處列式算算看）：</span>
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

    bindGymProgressStripEvents(container, "math", "b", (idx) => {
      maState.qIndexB = idx;
      renderMathMiddle();
    });

    initFreeScratchpad("basicScratchCanvas", "btnClearBasicScratch");

    const fb = document.getElementById("mathBasicFeedback");

    if (isFill) {
      const inp = document.getElementById("mathFillInput");
      const pad = document.getElementById("mathFillNumpad");
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "⌫", "清空"].forEach((key) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "numpad-btn";
        b.style.padding = "6px 12px";
        b.textContent = key;
        b.onclick = () => {
          SFX.playClick();
          if (!inp) return;
          if (key === "清空") inp.value = "";
          else if (key === "⌫") inp.value = inp.value.slice(0, -1);
          else inp.value += key;
        };
        pad.appendChild(b);
      });

      const checkFill = () => {
        const val = (inp.value || "").trim().replace(/,/g, "");
        const expected = String(q.answer).trim().replace(/,/g, "");
        if (val === expected) {
          SFX.playCorrect();
          inp.style.borderColor = "#189848";
          inp.style.background = "#eafff0";
          const isAllDone = handleMathQuestionCompleted(
            "b",
            curIdx,
            list.length,
            q.defBonus,
            q.id,
            `【${q.unit}】正解：${q.answer}${q.unitLabel || ""}`,
            q.question.slice(0, 32) + (q.question.length > 32 ? "..." : ""),
            (nextIdx) => {
              maState.qIndexB = nextIdx;
              renderMathMiddle();
            }
          );
          fb.style.color = "#187838";
          fb.innerHTML = isAllDone
            ? `🎊 答對了！正確答案是 <strong>${q.answer}${q.unitLabel ? " " + q.unitLabel : ""}</strong>！已完成中階全部 ${list.length} 題，即將進入結算畫面...`
            : `🎉 答對了！正確答案是 <strong>${q.answer}${q.unitLabel ? " " + q.unitLabel : ""}</strong>！（已完成 ${maState.done.b.size}/${list.length} 題）<br><small>💡 解析：${q.hint}</small>`;
        } else {
          SFX.playWrong();
          maState.stats.b.mistakes++;
          inp.style.borderColor = "#d83828";
          inp.style.background = "#fff2f0";
          fb.style.color = "#c83028";
          fb.innerHTML = `⚠️ 答案還不對喔！提示：${q.hint}`;
        }
      };

      document.getElementById("btnSubmitMathFill").onclick = checkFill;
      if (inp) {
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            checkFill();
          }
        });
      }
    } else {
      container.querySelectorAll(".quiz-option-btn").forEach((btn) => {
        btn.onclick = () => {
          const val = btn.getAttribute("data-val");
          container.querySelectorAll(".quiz-option-btn").forEach((b) => b.classList.remove("correct", "wrong"));

          if (val === String(q.answer)) {
            SFX.playCorrect();
            btn.classList.add("correct");
            const isAllDone = handleMathQuestionCompleted(
              "b",
              curIdx,
              list.length,
              q.defBonus,
              q.id,
              `【${q.unit}】正解：${q.answer}`,
              q.question.slice(0, 32) + (q.question.length > 32 ? "..." : ""),
              (nextIdx) => {
                maState.qIndexB = nextIdx;
                renderMathMiddle();
              }
            );
            fb.style.color = "#187838";
            fb.innerHTML = isAllDone
              ? `🎊 答對了！正確答案是 <strong>${q.answer}</strong>！已完成中階全部 ${list.length} 題，即將進入結算畫面...`
              : `🎉 答對了！正確答案是 <strong>${q.answer}</strong>！（已完成 ${maState.done.b.size}/${list.length} 題）<br><small>💡 解析：${q.hint}</small>`;
          } else {
            SFX.playWrong();
            maState.stats.b.mistakes++;
            btn.classList.add("wrong");
            fb.style.color = "#c83028";
            fb.innerHTML = `⚠️ 算錯囉！提示：${q.hint}`;
          }
        };
      });
    }

    document.getElementById("btnResampleMaB").onclick = () => {
      SFX.playClick();
      resampleMathTier("b");
      renderMathMiddle();
      showToast("🎲 已從數學題庫重新隨機抽取 8 題中階題目！");
    };
    document.getElementById("btnPrevMathBasic").onclick = () => {
      maState.qIndexB = (maState.qIndexB - 1 + list.length) % list.length;
      renderMathMiddle();
    };
    document.getElementById("btnNextMathBasic").onclick = () => {
      maState.qIndexB = (maState.qIndexB + 1) % list.length;
      renderMathMiddle();
    };
  }

  // --- (c) 進階（5 題）：第 1 到 4 單元題庫應用題解答 ---
  function renderMathWordProblem() {
    clearMathAdvanceTimer();
    if (!maState.poolC || maState.poolC.length === 0) {
      resampleMathTier("c");
    }
    const list = maState.poolC;
    const curIdx = maState.qIndexC % list.length;
    const q = list[curIdx];
    const container = document.getElementById("mathGymBody");

    const progressStripHtml = buildGymProgressStripHtml("math", "c", curIdx, list.length, maState.done.c);

    const optsHtml = q.options
      .map(
        (opt, idx) =>
          `<button type="button" class="quiz-option-btn" data-val="${opt}">(${
            ["A", "B", "C", "D"][idx] || idx + 1
          }) ${opt}</button>`
      )
      .join("");

    container.innerHTML = `
      <div class="dictation-panel">
        ${progressStripHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span class="brand-badge" style="background:#285898">${q.unit}</span>
            <strong style="font-size:1.18rem;margin-left:8px;">第 ${curIdx + 1} / ${list.length} 題 · ${q.title}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:800;color:#2058a8;">🛡️ 防禦力 +${q.defBonus} · HP +${Math.round(q.defBonus * 3)}（練習完 5 題進入結算）</span>
            <button type="button" class="hud-btn" id="btnResampleMaC" style="font-size:0.86rem;">🎲 重新隨機抽 5 題</button>
          </div>
        </div>

        <div style="margin-top:12px;padding:16px;background:#f4f8ff;border:2px solid #7898c8;border-radius:8px;font-size:1.15rem;font-weight:800;line-height:1.65;white-space:pre-line;color:#182c48;">${q.question}</div>

        <div class="scratchpad-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.9rem;font-weight:800;color:#285078;">✏️ 應用題手寫計算區（請先在下方白板列式計算，再選出答案）：</span>
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

    bindGymProgressStripEvents(container, "math", "c", (idx) => {
      maState.qIndexC = idx;
      renderMathWordProblem();
    });

    initFreeScratchpad("wordScratchCanvas", "btnClearWordScratch");

    container.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.onclick = () => {
        const val = btn.getAttribute("data-val");
        const fb = document.getElementById("wordProblemFeedback");
        container.querySelectorAll(".quiz-option-btn").forEach((b) => b.classList.remove("correct", "wrong"));

        if (val === q.answer) {
          SFX.playCorrect();
          btn.classList.add("correct");
          const isAllDone = handleMathQuestionCompleted(
            "c",
            curIdx,
            list.length,
            q.defBonus,
            q.id,
            `【${q.title}】正解：${q.answer}`,
            q.unit,
            (nextIdx) => {
              maState.qIndexC = nextIdx;
              renderMathWordProblem();
            }
          );
          fb.style.color = "#187838";
          fb.innerHTML = isAllDone
            ? `🎊 恭喜解開應用題！已完成進階全部 ${list.length} 題應用題，即將進入結算畫面...\n📘 【解題步驟】：\n${q.stepsHint}`
            : `🎉 恭喜解開應用題！答案正是 <strong>${q.answer}</strong>！（已完成 ${maState.done.c.size}/${list.length} 題）\n📘 【解題步驟】：\n${q.stepsHint}`;
        } else {
          SFX.playWrong();
          maState.stats.c.mistakes++;
          btn.classList.add("wrong");
          fb.style.color = "#c83028";
          fb.innerHTML = `⚠️ 答案不對喔！請參考解題思路再算算看：\n${q.stepsHint}`;
        }
      };
    });

    document.getElementById("btnResampleMaC").onclick = () => {
      SFX.playClick();
      resampleMathTier("c");
      renderMathWordProblem();
      showToast("🎲 已從題庫重新隨機抽取 5 題進階應用題！");
    };
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
    const hpGain = Math.round(defBonus * 3);
    const baseCoin = defBonus >= 7 ? 100 : defBonus >= 5 ? 70 : 50;
    const coinGain = Math.round(baseCoin * getCoinMultiplier());
    if (!lead) return { defGain: defBonus, hpGain, coinGain };

    state.defBonus = (state.defBonus || 0) + defBonus;
    state.coins = (state.coins || 0) + coinGain;

    state.party.forEach((p, i) => {
      ensurePokemonFields(p);
      const dGain = i === state.activeIndex ? defBonus : Math.max(2, Math.round(defBonus * 0.7));
      p.def += dGain;
      p.defTrained = (p.defTrained || 0) + dGain;
      p.maxHp += hpGain;
      p.hp = p.maxHp;
      gainPokemonExp(p, p.xpToNext || 20, false);
    });
    state.storage.forEach((p) => {
      ensurePokemonFields(p);
      const dGain = Math.max(2, Math.round(defBonus * 0.5));
      p.def += dGain;
      p.maxHp += 10;
      p.hp = p.maxHp;
      gainPokemonExp(p, p.xpToNext || 20, false);
    });

    state.mathScore = (state.mathScore || 0) + 10;
    if (qId && !state.completedQuestions.includes(qId)) {
      state.completedQuestions.push(qId);
    }
    if (state.mathScore >= 30 && !state.badges.math) {
      state.badges.math = true;
      state.items["great-ball"] = (state.items["great-ball"] || 0) + 2;
      addJournalEntry(`獲得【數學道館・邏輯徽章】！全隊升級且防禦力提升 +${defBonus}！`);
      showToast(`🏅 恭喜獲得【數學道館・邏輯徽章】！全隊升級 Lv+1、防禦+${defBonus}、HP+${hpGain}、金幣+₽${coinGain}！`);
    } else {
      showToast(`📘 數學道館特訓成功！【${lead.name}】升至 Lv.${lead.level}，防禦力 +${defBonus}、最大HP +${hpGain}，獲得金幣 ₽${coinGain}！`);
    }
    saveGame();
    updateAllHUD();
    return { defGain: defBonus, hpGain, coinGain };
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
      hint.textContent = "平板可直接點擊地圖任意位置自動行走，或使用畫面左下角十字鍵移動";
      return;
    }
    if (obj.kind === "door") {
      txt.textContent = obj.name || "進入建築";
      hint.textContent = "點擊右側「A 互動」按鈕、按下 E 或點擊建築即可進入！";
    } else if (obj.kind === "chest") {
      txt.textContent = `🎁 開啟【${obj.name}】領取金幣`;
      hint.textContent = "發現金幣寶箱！點擊「A 互動」或按 E 立即打開！";
    } else if (obj.kind === "waystone") {
      txt.textContent = `🗿 挑戰【${obj.name || "石碑守護者"}】`;
      hint.textContent = "點擊「A 互動」或按 E 喚醒遠古石碑守護者進行頭目對戰！";
    } else if (obj.kind === "npc") {
      if (obj.role === "breeder") {
        txt.textContent = `🧬 與 ${obj.name.split(" ")[0]} 開啟培育屋合成`;
        hint.textContent = "點擊「A 互動」開啟寶可夢基因合成與孵蛋工坊！";
      } else if (obj.role === "trainer") {
        txt.textContent = `⚔️ 向 ${obj.name} 發起訓練家對戰`;
        hint.textContent = "點擊「A 互動」進行訓練家切磋對戰，贏取豐厚 EXP 與金幣！";
      } else {
        txt.textContent = `💬 與 ${obj.name.split(" ")[0]} 對話`;
        hint.textContent = "點擊「A 互動」或按 E 聽取指引或開啟訓練！";
      }
    } else {
      txt.textContent = `🔍 查看 ${obj.name || "路標"}`;
      hint.textContent = "點擊「A 互動」或按 E 閱讀詳細內容";
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

    const topNurseryPill = document.getElementById("topNurseryPill");
    if (topNurseryPill) {
      if (state.egg) {
        topNurseryPill.textContent = `🥚 合成蛋：剩 ${state.egg.stepsRemaining} 步`;
      } else {
        topNurseryPill.textContent = `🧬 培育屋合成`;
      }
    }

    // START 選單附註
    document.getElementById("menuPartyCount").textContent = `${state.party.length}/6`;
    document.getElementById("menuCoinsTxt").textContent = `₽${state.coins || 0}`;
    document.getElementById("menuTrainerName").textContent = `${state.trainerName} 名片`;
    const menuEggTxt = document.getElementById("menuEggTxt");
    if (menuEggTxt) {
      menuEggTxt.textContent = state.egg ? `剩 ${state.egg.stepsRemaining} 步` : `孵蛋/合成`;
    }

    // 腳踏車按鈕
    const bikeBtn = document.getElementById("btnToggleBike");
    if (bikeBtn) {
      bikeBtn.style.display = state.ownedBicycle ? "inline-flex" : "none";
      bikeBtn.textContent = state.ridingBicycle ? "🚲 下車步行" : "🚲 騎乘腳踏車";
    }

    // 寶箱進度
    document.getElementById("worldChestCounter").textContent = `🎁 已開啟地圖寶箱：${state.collectedChests.length} / 16 · 走出城鎮四個路口可前往五大地圖`;

    if (lead) {
      ensurePokemonFields(lead);
      const hudImg = document.getElementById("hudLeaderImg");
      hudImg.src = getPokemonDisplayUrl(lead, "portrait");
      hudImg.onerror = () => {
        hudImg.src = getPokemonFallbackUrl(lead, "front");
      };
      const genTag = (lead.generation || 1) > 1 ? ` · G${lead.generation}` : "";
      document.getElementById("hudLeaderName").textContent = `${lead.name} · Lv.${lead.level}${genTag}`;
      document.getElementById("hudLeaderStats").textContent = `⚔️ATK ${lead.atk} · 🛡️DEF ${lead.def} · HP ${lead.hp}/${lead.maxHp}`;
      const hpPct = Math.max(0, Math.min(100, (lead.hp / lead.maxHp) * 100));
      const hpBar = document.getElementById("hudLeaderHpBar");
      hpBar.style.width = `${hpPct}%`;
      hpBar.style.background = hpPct < 25 ? "#df7666" : hpPct < 50 ? "#e4be5e" : "#58b888";

      const xpBar = document.getElementById("hudLeaderXpBar");
      const xpTxt = document.getElementById("hudLeaderXpTxt");
      const nextExp = lead.xpToNext || 20;
      const curXp = lead.xp || 0;
      const xpPct = Math.max(0, Math.min(100, (curXp / nextExp) * 100));
      if (xpBar) xpBar.style.width = `${xpPct}%`;
      if (xpTxt) xpTxt.textContent = `${curXp}/${nextExp}`;

      // 動態更新下方指引文字
      const objTitle = document.getElementById("objectiveTitle");
      const objDesc = document.getElementById("objectiveDesc");
      if (lead.atk < 12 || lead.def < 10) {
        objTitle.textContent = `📍 當前目標：先到「國語文道館」與「數學道館」訓練你的【${lead.name} Lv.${lead.level}】！`;
        objDesc.textContent = `目前【${lead.name}】攻擊力 ${lead.atk}、防禦力 ${lead.def}，還打不贏柳溪草地（建議 ⚔️12 / 🛡️10）的野生怪獸！請點選道館按鈕或走進城鎮建築特訓！`;
      } else {
        objTitle.textContent = `📍 當前目標：探索五大地圖、對戰升級並觸發等級進化！`;
        objDesc.textContent = `你的【${lead.name} Lv.${lead.level}】（⚔️ATK ${lead.atk} / 🛡️DEF ${lead.def}）已具備實戰能力！可走進草叢收服寶可夢、向訓練家與石碑守護者挑戰，達到進化等級後會自動進化！`;
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

    // 培育屋合成按鈕綁定
    const topNurseryPill = document.getElementById("topNurseryPill");
    if (topNurseryPill) topNurseryPill.onclick = () => openMenuModal("nursery");
    const btnHudNursery = document.getElementById("btnHudNursery");
    if (btnHudNursery) btnHudNursery.onclick = () => openMenuModal("nursery");
    const btnQuickNursery = document.getElementById("btnQuickNursery");
    if (btnQuickNursery) btnQuickNursery.onclick = () => openMenuModal("nursery");
    const btnQuickNurseryBottom = document.getElementById("btnQuickNurseryBottom");
    if (btnQuickNurseryBottom) btnQuickNurseryBottom.onclick = () => openMenuModal("nursery");

    // 存檔進度管理按鈕綁定
    const topSavePill = document.getElementById("topSavePill");
    if (topSavePill) topSavePill.onclick = () => openMenuModal("save");
    const btnHudSave = document.getElementById("btnHudSave");
    if (btnHudSave) btnHudSave.onclick = () => openMenuModal("save");
    const btnQuickSave = document.getElementById("btnQuickSave");
    if (btnQuickSave) btnQuickSave.onclick = () => openMenuModal("save");

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
            SAVE_SLOT_KEYS.forEach((key) => localStorage.removeItem(key));
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

    // 國語與數學道館分頁切換（每次切換皆重新隨機抽題）
    ["a", "b", "c"].forEach((t) => {
      document.getElementById(`chTab_${t}`).onclick = () => {
        SFX.playClick();
        switchChineseTier(t, true);
      };
      document.getElementById(`maTab_${t}`).onclick = () => {
        SFX.playClick();
        switchMathTier(t, true);
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
          if (currentBattle.kind === "trainer") {
            SFX.playWrong();
            setBattleMessage("⚠️ 訓練家正式對戰中無法逃跑！");
            return;
          }
          SFX.playClick();
          showToast("💨 你安全地逃離了對戰！");
          closeBattle();
        } else {
          showBattleSubMenu(cmd);
        }
      };
    });

    // ----------------------------------------------------------------------
    // 平板與手機觸控：支援長按連走、手指滑動換向的虛擬十字鍵 (D-Pad) 與 A 互動鍵
    // ----------------------------------------------------------------------
    let dpadHoldInterval = null;
    let activeDpadDir = null;

    function updateDpadVisualState(dir) {
      document.querySelectorAll("[data-dir]").forEach((el) => {
        el.classList.toggle("pressed", Boolean(dir && el.getAttribute("data-dir") === dir));
      });
    }

    function startDpadMove(dir) {
      if (!dir || isAnyModalOpen()) return;
      walkTarget = null;
      if (activeDpadDir === dir && dpadHoldInterval) return;
      stopDpadMove();
      activeDpadDir = dir;
      updateDpadVisualState(dir);
      movePlayer(dir);
      dpadHoldInterval = setInterval(() => {
        if (isAnyModalOpen()) {
          stopDpadMove();
          return;
        }
        movePlayer(activeDpadDir);
      }, 135);
    }

    function stopDpadMove() {
      activeDpadDir = null;
      if (dpadHoldInterval) {
        clearInterval(dpadHoldInterval);
        dpadHoldInterval = null;
      }
      updateDpadVisualState(null);
    }

    // 綁定所有帶有 data-dir 的十字鍵按鈕（含地圖左下角懸浮十字鍵與底部備用十字鍵）
    document.querySelectorAll("[data-dir]").forEach((btn) => {
      const dir = btn.getAttribute("data-dir");
      btn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          startDpadMove(dir);
        },
        { passive: false }
      );
      btn.addEventListener("pointerup", stopDpadMove);
      btn.addEventListener("pointercancel", stopDpadMove);
    });

    // 支援手指在十字鍵區域滑動直接切換方向（不需抬起手指）
    const onscreenDpad = document.getElementById("onscreenDpad");
    if (onscreenDpad) {
      onscreenDpad.addEventListener(
        "pointermove",
        (e) => {
          if (!activeDpadDir) return;
          e.preventDefault();
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          const dirBtn = hit && hit.closest ? hit.closest("[data-dir]") : null;
          if (dirBtn) {
            const newDir = dirBtn.getAttribute("data-dir");
            if (newDir && newDir !== activeDpadDir) {
              startDpadMove(newDir);
            }
          }
        },
        { passive: false }
      );
    }

    window.addEventListener("pointerup", stopDpadMove);
    window.addEventListener("pointercancel", stopDpadMove);
    window.addEventListener("blur", stopDpadMove);

    // 畫面右下角懸浮「A 互動」按鈕
    const onscreenInteractBtn = document.getElementById("onscreenInteractBtn");
    if (onscreenInteractBtn) {
      onscreenInteractBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerObjectInteraction();
        },
        { passive: false }
      );
    }

    // ----------------------------------------------------------------------
    // 點擊或拖曳地圖 Canvas：支援平板直接點地自動尋路行走 & 按住拖曳導引移動
    // ----------------------------------------------------------------------
    let isCanvasDragging = false;
    let lastDragTileKey = "";

    function handleCanvasPointerTarget(clientX, clientY, isInitialTap) {
      if (isAnyModalOpen()) return;
      const rect = overworldCanvas.getBoundingClientRect();
      const clickX = ((clientX - rect.left) / rect.width) * overworldCanvas.width + camX;
      const clickY = ((clientY - rect.top) / rect.height) * overworldCanvas.height + camY;
      const gx = Math.floor(clickX / TILE_SIZE);
      const gy = Math.floor(clickY / TILE_SIZE);
      const reg = getCurrentRegion();

      const tileKey = `${gx},${gy}`;
      if (!isInitialTap && tileKey === lastDragTileKey) return;
      lastDragTileKey = tileKey;

      // 檢查是否點擊在建築物、門、寶箱或 NPC 上
      if (isInitialTap) {
        for (const obj of reg.objects || []) {
          const ow = obj.width || 1;
          const oh = obj.height || 1;
          if (gx >= obj.x && gx < obj.x + ow && gy >= obj.y && gy < obj.y + oh) {
            if (obj.kind === "building") {
              const door = (reg.objects || []).find(
                (d) => d.kind === "door" && d.x >= obj.x && d.x < obj.x + ow
              );
              if (door) {
                const dist = Math.abs(state.x - door.x) + Math.abs(state.y - door.y);
                if (dist <= 2) {
                  triggerObjectInteraction(door);
                } else {
                  startAutoWalkTo(door.x, Math.min(MAP_ROWS - 1, door.y + 1), door);
                }
                return;
              }
            }
            if (["door", "chest", "npc", "sign", "waystone"].includes(obj.kind)) {
              const dist = Math.abs(state.x - obj.x) + Math.abs(state.y - obj.y);
              if (dist <= 2) {
                triggerObjectInteraction(obj);
              } else {
                startAutoWalkTo(obj.x, obj.y, obj);
              }
              return;
            }
          }
        }
      }

      // 點擊或拖曳一般地面：啟動自動尋路走到該格
      startAutoWalkTo(gx, gy, null);
    }

    overworldCanvas.addEventListener(
      "pointerdown",
      (e) => {
        if (isAnyModalOpen()) return;
        e.preventDefault();
        isCanvasDragging = true;
        lastDragTileKey = "";
        handleCanvasPointerTarget(e.clientX, e.clientY, true);
      },
      { passive: false }
    );

    overworldCanvas.addEventListener(
      "pointermove",
      (e) => {
        if (!isCanvasDragging || isAnyModalOpen()) return;
        e.preventDefault();
        handleCanvasPointerTarget(e.clientX, e.clientY, false);
      },
      { passive: false }
    );

    window.addEventListener("pointerup", () => {
      isCanvasDragging = false;
    });
    window.addEventListener("pointercancel", () => {
      isCanvasDragging = false;
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
        walkTarget = null;
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
