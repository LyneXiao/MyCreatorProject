
const {ccclass, property} = cc._decorator;

export default class NodeCache {
  private _prefab: cc.Prefab | cc.Node = null
  private _nodePool: cc.NodePool = null
  private _key: string = null
  private _componentName: string = null
  private _createNode: () => cc.Node = null

  public get key (): string {
    return this._key
  }

  private _createNodeWithPrefab (): cc.Node {
    return cc.instantiate(this._prefab as cc.Prefab)
  }

  private _createNodeWithNode (): cc.Node {
    return cc.instantiate<cc.Node>(this._prefab as cc.Node)
  }

  constructor (prefab: cc.Prefab|cc.Node, cmpName: string = null, defaultNodeCount: number = 0) {
    this._prefab = prefab
    this._componentName = cmpName
    this._nodePool = new cc.NodePool(cmpName)
    if (prefab instanceof cc.Prefab) {
      this._key = this._getPrefabKey(prefab.data)
      this._createNode = this._createNodeWithPrefab.bind(this)
    } else {
      this._key = this._getPrefabKey(prefab)
      this._createNode = this._createNodeWithNode.bind(this)
    }

    if (defaultNodeCount > 0) {
      this.prepare(defaultNodeCount)
    }
  }

  private _getPrefabKey (data:any): string {
    return data && data._prefab && data._prefab.fileId
  }

  public prepare (count: number) {
    if (this._nodePool.size() >= count) return
    let remainCount = count - this._nodePool.size()
    for (let i = 0; i < remainCount; i++) {
      this._nodePool.put(this._createNode())
    }
  }

  public get (): cc.Node {
    this.prepare(1)
    let ret = this._nodePool.get(this)
    return ret 
  }

  public getWithArguments (...args:any[]): cc.Node {
    this.prepare(1)
    let ret = this._nodePool.get.apply(this._nodePool, args)
    return ret
  }

  public put (node: cc.Node) {
    if (this._getPrefabKey(node) !== this._key) {
      cc.error('cannot put cc.Node %o into NodeCache named %s', node, this._key)
      node.removeFromParent()
      return node.destroy()
    }
    this._nodePool.put(node)
  }

  public clear () {
    this._nodePool.clear()
  }
}
