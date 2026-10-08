export interface CharacterProps {
  idx: number;
  name: string;
  status: Object;
  skills: Object;
}

class Character implements CharacterProps {
  constructor() {}
  idx: number;
  name: string;
  status: Object;
  skills: Object;
}

export default Character;
