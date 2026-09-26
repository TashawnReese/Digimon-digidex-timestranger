// Starting points for the character creator. Each one is only a seed: the AI
// builds the actual rules, stats and abilities from `concept` (plus whatever
// the player adds), so anything not listed here works just as well.

export const PRESETS = [
  // ---------- pop culture ----------
  {
    id: 'keyblade', group: 'Pop culture', name: 'Keyblade Wielder', source: 'Kingdom Hearts',
    blurb: 'Chosen by a key-shaped blade to seal the darkness between worlds.',
    concept: 'A Keyblade wielder in the style of Kingdom Hearts who travels between worlds, fights the Heartless with a Keyblade, casts Fire/Blizzard/Thunder/Cure magic, and has Drive Forms.',
    art: 'young hero holding a giant ornate key-shaped sword, glowing heart symbol, stained glass platform, starry void, vibrant',
  },
  {
    id: 'shinigami', group: 'Pop culture', name: 'Shinigami', source: 'Bleach',
    blurb: 'A Soul Reaper with a Zanpakutō waiting to reveal its true name.',
    concept: 'A Shinigami (Soul Reaper) from Bleach with a Zanpakutō that has a Shikai and a sealed Bankai, Kidō spells, Shunpo and spiritual pressure (Reiatsu).',
    art: 'soul reaper in black shihakusho robes drawing a glowing katana, white spiritual energy, full moon over rooftops',
  },
  {
    id: 'persona', group: 'Pop culture', name: 'Persona User', source: 'Persona 4',
    blurb: 'A high schooler who summons a Persona inside the TV world.',
    concept: 'A Persona user in the style of Persona 4: a high school student in rural Inaba who enters the TV world, summons a Persona, exploits elemental weaknesses, and builds Social Links on a daily calendar.',
    art: 'high school student in a yellow fog summoning a towering mythological spirit, shattering tarot card, tv static, stylish',
  },
  {
    id: 'jedi', group: 'Pop culture', name: 'Jedi Knight', source: 'Star Wars',
    blurb: 'A guardian of peace who hears the whisper of the Force.',
    concept: 'A Jedi Knight with a lightsaber, Force powers (push, pull, mind trick, foresight), a lightsaber form, and a light side / dark side meter.',
    art: 'robed jedi knight igniting a blue laser sword in a desert canyon at dusk, twin suns, cinematic',
  },
  {
    id: 'ninja', group: 'Pop culture', name: 'Shinobi', source: 'Naruto',
    blurb: 'A hidden-village ninja with chakra, hand signs and a secret jutsu.',
    concept: 'A ninja of a hidden village in the style of Naruto, using chakra, hand-sign jutsu, a chakra nature, taijutsu, and a family kekkei genkai.',
    art: 'ninja with a headband leaping between trees making hand signs, swirling chakra, leaf village',
  },
  {
    id: 'trainer', group: 'Pop culture', name: 'Monster Trainer', source: 'Pokémon',
    blurb: 'Catch, raise and battle alongside a team of creatures.',
    concept: 'A Pokémon trainer who catches and raises Pokémon, battles with type matchups and four-move sets, and challenges gyms for badges.',
    art: 'young trainer throwing a capture ball, a small fire lizard creature leaping out, grassy route, bright anime style',
  },
  {
    id: 'tamer', group: 'Pop culture', name: 'Digimon Tamer', source: 'Digimon',
    blurb: 'A human partnered with a Digimon that digivolves in battle.',
    concept: 'A Digimon Tamer with a Digivice and a partner Digimon that digivolves from Rookie to Champion to Ultimate and Mega, using modify cards and a bond meter.',
    art: 'kid holding a glowing digivice beside a small orange dinosaur digital monster, data streams, digital world sky',
  },
  {
    id: 'stand', group: 'Pop culture', name: 'Stand User', source: "JoJo's Bizarre Adventure",
    blurb: 'A fighting spirit with one strange, very specific power.',
    concept: "A Stand user from JoJo's Bizarre Adventure with a named Stand, a Stand stat card (Power, Speed, Range, Durability, Precision, Potential) and one bizarre ability used cleverly.",
    art: 'dramatic posing fighter with a muscular humanoid spirit behind them, menacing katakana symbols, bold colors',
  },
  {
    id: 'hunter', group: 'Pop culture', name: 'Nen Hunter', source: 'Hunter x Hunter',
    blurb: 'A licensed Hunter with a Nen ability bound by strict vows.',
    concept: 'A Hunter from Hunter x Hunter with a Nen type (Enhancer, Transmuter, Emitter, Conjurer, Manipulator or Specialist), a Hatsu ability, and Vows and Limitations that make it stronger.',
    art: 'young hunter surrounded by a glowing aura, playing card, forest exam grounds, dynamic anime style',
  },
  {
    id: 'pirate', group: 'Pop culture', name: 'Devil Fruit Pirate', source: 'One Piece',
    blurb: 'A pirate with a Devil Fruit power and a dream on the Grand Line.',
    concept: 'A pirate from One Piece with a Devil Fruit power (and its weakness to the sea), Haki, a bounty, and a crew position on a ship sailing the Grand Line.',
    art: 'grinning pirate captain on the bow of a ship with a flag, stretching fist, ocean waves, sunny adventure',
  },
  {
    id: 'witcher', group: 'Pop culture', name: 'Witcher', source: 'The Witcher',
    blurb: 'A mutated monster hunter with signs, potions and two swords.',
    concept: 'A Witcher with steel and silver swords, Signs (Igni, Aard, Quen, Yrden, Axii), alchemy potions with toxicity, and monster contracts.',
    art: 'grim monster hunter with two swords and yellow cat eyes in a misty swamp, lantern light, dark fantasy',
  },
  {
    id: 'mecha', group: 'Pop culture', name: 'Mecha Pilot', source: 'Gundam / Evangelion',
    blurb: 'A pilot synced to a giant robot, one sortie at a time.',
    concept: 'A mecha pilot who fights in a giant robot with separate pilot and mech stats, weapon loadouts, heat and energy management, and a sync rate.',
    art: 'giant humanoid battle robot kneeling in a hangar, pilot on the gantry, sparks, dramatic lighting',
  },
  // ---------- classic fantasy ----------
  {
    id: 'fighter', group: 'Classic', name: 'Fighter', source: 'Classic fantasy',
    blurb: 'Steel, grit and a shield wall between the party and doom.',
    concept: 'A classic D&D-style fighter: a master of weapons and armor with Second Wind, Action Surge and a fighting style.',
    art: 'armored warrior with sword and shield standing in a ruined castle courtyard, banners, epic fantasy painting',
  },
  {
    id: 'wizard', group: 'Classic', name: 'Wizard', source: 'Classic fantasy',
    blurb: 'A scholar of the arcane with a spellbook full of secrets.',
    concept: 'A classic D&D-style wizard with a spellbook, spell slots, cantrips and an arcane school.',
    art: 'wizard in star-embroidered robes casting glowing runes from a spellbook in a candlelit tower library',
  },
  {
    id: 'rogue', group: 'Classic', name: 'Rogue', source: 'Classic fantasy',
    blurb: 'Quick fingers, quicker blades, and a price on their head.',
    concept: 'A classic D&D-style rogue with sneak attack, lockpicking, stealth and a thieves-guild past.',
    art: 'hooded rogue crouched on a rain-slick rooftop with twin daggers, city lights below, noir fantasy',
  },
  {
    id: 'cleric', group: 'Classic', name: 'Cleric', source: 'Classic fantasy',
    blurb: 'A holy warrior who heals allies and smites the undead.',
    concept: 'A classic D&D-style cleric with a deity, healing and radiant spells, Channel Divinity and Turn Undead.',
    art: 'cleric raising a glowing holy symbol against shadowy undead in a crypt, golden light rays',
  },
  {
    id: 'ranger', group: 'Classic', name: 'Ranger', source: 'Classic fantasy',
    blurb: 'A tracker and archer with an animal companion.',
    concept: 'A classic D&D-style ranger with a bow, a favored enemy, tracking, and an animal companion.',
    art: 'ranger archer drawing a bow in an ancient forest with a wolf companion, dappled sunlight',
  },
  {
    id: 'paladin', group: 'Classic', name: 'Paladin', source: 'Classic fantasy',
    blurb: 'An oath-bound knight whose sword burns with conviction.',
    concept: 'A classic D&D-style paladin with an oath, Divine Smite, Lay on Hands and an aura.',
    art: 'paladin in shining plate armor with a glowing sword, cathedral light, heroic',
  },
];

export const ART_STYLES = {
  anime: 'anime key visual, cel shading, vivid colors, detailed',
  painterly: 'epic fantasy digital painting, dramatic lighting, highly detailed, artstation',
  comic: 'bold comic book art, ink lines, halftone, dynamic',
  cinematic: 'cinematic film still, photorealistic, volumetric lighting, 35mm',
  pixel: '16-bit pixel art, retro jrpg, crisp pixels',
  watercolor: 'storybook watercolor illustration, soft washes, whimsical',
};

export const TONES = ['Heroic', 'Dark', 'Comedic', 'Mystery', 'Slice of life', 'Horror', 'Epic'];

export const RULES_STYLES = {
  light: 'Rules-light: narrative first, roll only when it matters.',
  balanced: 'Balanced: regular checks and tactical combat, but brisk.',
  crunchy: 'Crunchy: detailed mechanics, frequent rolls, resource management.',
};
