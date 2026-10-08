export interface CharacterProps {
  idx: number;
  name: string;
  status: Object;
  skills: Object;
}

class Character implements CharacterProps {
  idx: number = 0;
  name: string = '';
  status: Object = {};
  skills: Object = {};
  constructor() {}
}

export default Character;
