import NodeCache from './NodeCache'

const {ccclass, property, inspector} = cc._decorator

@ccclass
export default class TableView extends cc.Component {
  @property(cc.ScrollView)
  scroller: cc.ScrollView = null

  @property(cc.Node)
  itemImpl: cc.Node = null

  @property(cc.String)
  compenetName: string = ''

  @property([cc.Component.EventHandler])
  updateHandlers: cc.Component.EventHandler[] = []

  private _itemSize: cc.Size = null
  private _itemAnchor: cc.Vec2 = null

  private _col: number = 0
  private _row: number = 0
  private _metaX: number = 0
  private _metaY: number = 0
  private _colCalc: (x) => number = null
  private _rowCalc: (y) => number = null
  private _isVertical: boolean = true
  private _isReverse: boolean = false

  private _nodeCache: NodeCache = null

  private _dataList: any[] = []

  public get metaSize (): cc.Size {
    return cc.size(this._metaX, this._metaY)
  }

  public get dataList (): any[] {
    return this._dataList
  }

  public set dataList (value: any[]) {
    this._dataList = value
    this.reload()
  }

  public resetWithList (dataList: any[], moveToMinOffset:boolean = true) {
    this._dataList = dataList
    if (moveToMinOffset) {
      this.scroller.scrollToOffset(cc.v2(0,0))
    }
    this.reload()
  }

  private _showItems: cc.Node[] = []
  private _panels: cc.Node[] = []

  onLoad () {
    this.itemImpl.parent = null
    this.itemImpl.active = true
    this.itemImpl.position = cc.Vec2.ZERO.clone()
    this.compenetName = this.compenetName && this.compenetName.length > 0 ? this.compenetName : null
    this._nodeCache = new NodeCache(this.itemImpl, this.compenetName)
    this._itemSize = this.itemImpl.getContentSize()
    this._itemAnchor = this.itemImpl.getAnchorPoint()

    this.scroller.node.on('size-changed', this._onScrollerSizeChanged, this)
    this.scroller.node.on('scrolling', this._onScrollerScrolling, this)
  }

  onDestroy () {
    if (this.scroller && this.scroller.node) {
      this.scroller.node.off('size-changed', this._onScrollerSizeChanged, this)
      this.scroller.node.off('scrolling', this._onScrollerScrolling, this)
    }

    this._nodeCache.clear()
  }

  // update (dt) {}

  public reload () {
    this.clearItems()
    let itemCount = this._resetContentSize()
    let widget: cc.Widget = this.itemImpl.getComponent(cc.Widget)
    if (widget) {
      let tempNode: cc.Node = new cc.Node
      tempNode.setContentSize(this._itemSize)
      this.itemImpl.parent = tempNode
      widget.updateAlignment()
      this.itemImpl.parent = null
      this._nodeCache.clear()
    }
    this._nodeCache.prepare(itemCount)

    if (!this._dataList || this._dataList.length <= 0) return
    let currentOffset: cc.Vec2 = this.scroller.getScrollOffset()
    if (!this.scroller.isScrolling) {
      let maxOffset: cc.Vec2 = this.scroller.getMaxScrollOffset()
      if (maxOffset.x < 0) {
        currentOffset.x = Math.min(0, Math.max(maxOffset.x, currentOffset.x))
      } else if (maxOffset.x > 0) {
        currentOffset.x = Math.max(0, Math.min(maxOffset.x, currentOffset.x))
      }
      if (maxOffset.y < 0) {
        currentOffset.y = Math.min(0, Math.max(maxOffset.y, currentOffset.y))
      } else if (maxOffset.y > 0) {
        currentOffset.y = Math.max(0, Math.min(maxOffset.y, currentOffset.y))
      }
    }
    this._showItemsWithPosition(currentOffset)
  }

  private _resetContentSize (): number {
    let content: cc.Node = this.scroller.content
    let layout: cc.Layout = content.getComponent(cc.Layout)

    let viewSize: cc.Size = this.scroller.node.getContentSize()
    let col: number, row: number
    this._col = this._row = 0
    this._metaX = this._metaY = 0
    this._colCalc = this._rowCalc = null
    switch (layout.type) {
      case cc.Layout.Type.GRID: {
        col = Math.floor((viewSize.width - layout.paddingLeft - layout.paddingRight + layout.spacingX) / (layout.spacingX + layout.cellSize.width))
        row = Math.floor((viewSize.height - layout.paddingTop - layout.paddingBottom + layout.spacingY) / (layout.spacingY + layout.cellSize.height))
        if (layout.startAxis === cc.Layout.AxisDirection.HORIZONTAL) {
          col += 2
          this._row = row
          this._isVertical = false
          this._isReverse = layout.horizontalDirection === cc.Layout.HorizontalDirection.RIGHT_TO_LEFT

          let offsetX = layout.spacingX + (this._isReverse ? layout.paddingRight : layout.paddingLeft)
          let metaX = layout.spacingX + layout.cellSize.width
          this._colCalc = function (x): number {
            return Math.floor((x - offsetX) / metaX)
          }
          this._metaX = metaX
          this._metaY = layout.cellSize.height
        } else {
          row += 2
          this._col = col
          this._isVertical = true
          this._isReverse = layout.verticalDirection === cc.Layout.VerticalDirection.BOTTOM_TO_TOP

          let offsetY = layout.spacingY + (this._isReverse ? layout.paddingBottom : layout.paddingTop)
          let metaY = layout.spacingY + layout.cellSize.height
          this._rowCalc = function (y): number {
            return Math.floor((y - offsetY) / metaY)
          }
          this._metaY = metaY
          this._metaX = layout.cellSize.width
        }
      }
        break
      case cc.Layout.Type.VERTICAL: {
        this._isReverse = layout.verticalDirection === cc.Layout.VerticalDirection.BOTTOM_TO_TOP
        this._isVertical = true
        this._col = col = 1
        this._itemSize = cc.size(viewSize.width, this.itemImpl.getContentSize().height)
        row = Math.floor((viewSize.height - layout.paddingTop - layout.paddingBottom + layout.spacingY) / (layout.spacingY + this._itemSize.height))
        row += 2

        let offsetY = /**layout.spacingY + */(this._isReverse ? layout.paddingBottom : layout.paddingTop)
        let metaY = layout.spacingY + this._itemSize.height
        this._rowCalc = function (y): number {
          return Math.floor((y - offsetY) / metaY)
        }
        this._metaY = metaY
        this._metaX = this._itemSize.width
      }
        break
      case cc.Layout.Type.HORIZONTAL:
        this._isReverse = layout.horizontalDirection === cc.Layout.HorizontalDirection.RIGHT_TO_LEFT
        this._isVertical = false
        this._row = row = 1
        this._itemSize = cc.size(this.itemImpl.getContentSize().width, viewSize.height)
        col = Math.floor((viewSize.width - layout.paddingLeft - layout.paddingRight + layout.spacingX) / (layout.spacingX + this._itemSize.width))
        col += 2

        let offsetX = /**layout.spacingX + */(this._isReverse ? layout.paddingRight : layout.paddingLeft)
        let metaX = layout.spacingX + this._itemSize.width
        this._colCalc = function (x): number {
          return Math.floor((x - offsetX) / metaX)
        }
        this._metaX = metaX
        this._metaY = this._itemSize.height
        break
      case cc.Layout.Type.NONE:
      default:
        break
    }

    content.removeAllChildren()
    this._panels.length = 0
    for (let i = 0; i < this._dataList.length; i++) {
      let panel: cc.Node = new cc.Node
      panel.setContentSize(this._itemSize)
      panel.setAnchorPoint(this._itemAnchor)
      panel.name = i + ''
      panel.parent = content
      this._panels.push(panel)
    }
    layout.updateLayout()

    return col * row
  }

  clearItems () {
    for (let item of this._showItems) {
      this._nodeCache.put(item)
    }
    this._showItems.length = 0
  }

  getItemNodeByIndex (index:number): cc.Node {
    let ret: cc.Node = null
    for (let item of this._showItems) {
      if (parseInt(item.name) === index) {
        ret = item
        break
      }
    }
    return ret
  }

  getItemByIndex<T> (index: number): T {
    let node: cc.Node = this.getItemNodeByIndex(index)
    if (!node) return null
    let comp: any = node.getComponent(this.compenetName)
    return comp as T
  }

  getShowItems<T> (): Array<T> {
    let ret: Array<T> = []
    for (let item of this._showItems) {
      let comp: T = item.getComponent(this.compenetName) as T
      ret.push(comp)
    }
    return ret
  }

  updateItemByIndex (index:number) {
    let item: cc.Node = this.getItemNodeByIndex(index)
    if (!item) return
    let comp: any = item.getComponent(this.compenetName)
    if (comp && comp.reuse && comp.unuse) {
      comp.unuse()
      comp.reuse(index, this._dataList[index])
    }
  }

  private _onScrollerSizeChanged () {
    this.reload()
  }

  private _onScrollerScrolling () {
    this._showItemsWithPosition(this.scroller.getScrollOffset())
  }

  private _showItemsWithPosition (pos: cc.Vec2) {
    let viewSize: cc.Size = this.scroller.node.getContentSize()
    let maxOffset: cc.Vec2 = this.scroller.getMaxScrollOffset()
    if (this._isVertical) {
      let offsetY: number = this._isReverse ? maxOffset.y - pos.y : pos.y
      return this._showItemsInVerticalDirection(this._col, offsetY, viewSize.height)
    } else {
      let offsetX: number = this._isReverse ? pos.x - maxOffset.x : -pos.x
      return this._showItemsInHorizontalDirection(this._row, offsetX, viewSize.width)
    }
  }

  private _showItemsInVerticalDirection (col: number, offsetY: number, height: number) {
    let minRow: number = this._rowCalc(offsetY)
    let maxRow: number = this._rowCalc(offsetY + height) + 1
    let minIndex: number = this._col * minRow
    let maxIndex: number = this._col * maxRow - 1
    return this._updateItems(minIndex, maxIndex)
  }

  private _showItemsInHorizontalDirection (row: number, offsetX: number, width: number) {
    let minCol: number = this._colCalc(offsetX)
    let maxCol: number = this._colCalc(offsetX + width) + 1
    let minIndex: number = this._row * minCol
    let maxIndex: number = this._row * maxCol - 1
    return this._updateItems(minIndex, maxIndex)
  }

  private _updateItems (minIndex: number, maxIndex: number) {
    // hide
    if (this._showItems.length > 0) {
      for (let i = this._showItems.length - 1; i > 0; i--) {
        let item = this._showItems[i]
        if (parseInt(item.name) < minIndex || parseInt(item.name) > maxIndex) {
          this._nodeCache.put(item)
          this._showItems.splice(i, 1)
        }
      }
    }
    // show
    for (let index = minIndex; index <= maxIndex; index++) {
      let panel: cc.Node = this._panels[index]
      if (!panel || panel.children.length > 0) continue
      let data: any = this._dataList[index]
      let item: cc.Node = this._nodeCache.getWithArguments(index, data)
      item.name = index + ''
      item.parent = panel
      this._showItems.push(item)
      if (this.updateHandlers.length > 0) {
        let event: cc.Event.EventCustom = new cc.Event.EventCustom('update', false)
        let comp: cc.Component = this.compenetName && item.getComponent(this.compenetName) || null
        cc.Component.EventHandler.emitEvents(this.updateHandlers, event, comp);
      }
    }
  }
}