import { ItemProps } from './item';

export interface ItemListProps {
  list: Array<ItemProps>;
}
/**
 * item들의 모음 인벤토리가 되기도 하고 드랍 테이블이 되기도하고 그럴듯
 * 식별및 카운팅 기능,수납 등 여러 부분이 필요하다.
 */
class ItemList implements ItemListProps {
  constructor(list: ItemProps[]) {
    this.list = list;
    this.listMap = new Map();
    list.forEach((item, idx) => {
      this.listMap.set(item.name, idx);
    });
  }
  list: ItemProps[];
  private listMap: Map<string, number>;

  getListKey(key: string) {
    return this.listMap.get(key);
  }
}

export default ItemList;
