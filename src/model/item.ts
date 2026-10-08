export interface ItemProps {
  idx: number;
  name: string;
  spec: Object;
  limit: number;
  category: string;
  value: number;
}
/** 추상클래스 느낌으로 기본적인 틀을 짜고 시스템적인 부분들에 대한건 외부에서 주입하는 구조로
 * 데이터 역시 외부에서 주입하는게 나을거 같다.
 * 시스템의 근간이 되는 로직들도 변경가능한게 좋을듯
 * 기획부분에서 고민할게 많음.
 */
class Item implements ItemProps {
  _renderCb: Function;
  constructor(render: Function) {
    this._renderCb = render;
  }
  idx: number = 0;
  name: string = '';
  spec: Object = {};
  limit: number = 0;
  category: string = '';
  value: number = 0;

  render() {
    this._renderCb();
  }
}

export default Item;
