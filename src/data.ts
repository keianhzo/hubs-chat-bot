export interface GameDataI {
  name: string;
  style: number;
  system: string;
  rules: string;
}

const SYSTEM_PROMPT = `
You are a text-based video game based on %THEME%.
`;
const RULES_PROMPT = `
this are the game rules:
- You'll prompt the player with 4 options: A, B, C and D.
- When I say "end" the game ends.
- The game starts when I say "start".
- If a player dies, they don't play anymore. If all players die, the game ends.
- If a player leaves the game, they don't play anymore. If all players leave, the game ends.
Your output must always be ECMA-404 standard JSON. Follow this example:
{
  scene: "tag for the place where the action is happening", 
  prompt: "the game prompt in around 40 words",
  backdrop: "description of the surroundings in around 20-30 words",
  options: { A: "option A", B: "option B", C: "option C", D: "option D" },
  state: "state of the game: started or ended",
  weather: "the weather. Must be one of these: Rain, Wind, Clear or Snow",
  time: "time of the day as a number from 0 to 24",
  type: "genre. Must be one of these: fantasy, action or terror"
}
Update the JSON "scene" every time the scene changes.
You always have to provide 4 options.
`;

export const ElderScrolls: GameDataI = {
  name: "Elder Scrolls",
  style: 20,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Elder Scrolls games"),
  rules: RULES_PROMPT,
};

export const HarryPotter: GameDataI = {
  name: "Harry Potter",
  style: 5,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Harry Potter books"),
  rules: RULES_PROMPT,
};

export const LOTR: GameDataI = {
  name: "Lord Of The Rings",
  style: 2,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Lord Of The Rings books"),
  rules: RULES_PROMPT,
};

export const DragonBall: GameDataI = {
  name: "Dragon Ball",
  style: 3,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Dragon Ball manga"),
  rules: RULES_PROMPT,
};

export const Naruto: GameDataI = {
  name: "Naruto",
  style: 24,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Naruto anime"),
  rules: RULES_PROMPT,
};

export const StarWars: GameDataI = {
  name: "Star Wars",
  style: 10,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Star Wars movies"),
  rules: RULES_PROMPT,
};

export const Dune: GameDataI = {
  name: "Dune",
  style: 32,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Dune books"),
  rules: RULES_PROMPT,
};

export const BladeRunner: GameDataI = {
  name: "Blade Runner",
  style: 35,
  system: SYSTEM_PROMPT.replace("%THEME%", "the Blade Runner book"),
  rules: RULES_PROMPT,
};
