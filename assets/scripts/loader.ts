
type SUCCESS_CALL  = (res:any[]|any)=>void
type FAILED_CALL   = (err:Error)=>void
type ERROR_CALL    = (error:string)=>void
type PROGRESS_CALL = (completedCount: number, totalCount: number, item: any) => void

var callInNextTick = CC_JSB ?
                function (callback, p1=null, p2=null) {
                    if (callback) {
                        cc.director.once('_director_next_tick', function () {
                            callback(p1, p2);
                        });
                    }
                }
                :
                function (callback, p1=null, p2=null) {
                    if (callback) {
                        setTimeout(function () {
                            callback(p1, p2);
                        }, 0);
                    }
                }

class LoaderItem {
  isReleased: boolean      = false      // 是否已被释放
  urls: string[]           = null       // 加载项列表
  type: typeof cc.Asset    = null       // 加载资源类型
  resources: Object        = null       // 所有使用资源的reference id
  maxRetryTimes: number    = 0          // 最大重试次数

  protected _currentRetryTimes: number = 0
  protected _loadedCompleted: boolean = false
  protected _singleFile: boolean = false

  /**
   * 构造加载条目
   * @param url         加载资源路径
   * @param type        加载资源类型
   * @param retryTimes  加载重试资数
   */
  constructor (url: string[]|string, type: typeof cc.Asset, retryTimes: number) {
    let urls:string[] = typeof url === 'string' ? [url] : url
    this._singleFile = typeof url === 'string'
    this.urls       = urls
    this.type       = type
    this.resources  = {}
    this.isReleased = false
    this.maxRetryTimes = retryTimes
    this._currentRetryTimes = 0
    this._loadedCompleted = false

    // 已加载的资源，先保存在资源引用中，防止被移除
    for (let url of this.urls) {
      let res: any = cc.loader.getRes(url, this.type)
      if (res) {
        this._cacheRes(res)
      }
    }
  }

  /**
   * 缓存已使用资源
   * @param resource   缓存单个资源的所有使用资源
   * @param errorCall  依赖资源不存在时的错误回调
   */
  protected _cacheRes (resource: any, errorCall: ERROR_CALL = null) {
    let loader: any = cc.loader
    this.resources[loader._getReferenceKey(resource)] = true
    for (let key of loader.getDependsRecursively(resource)) {
      if (key === null) continue
      this.resources[key] = true
      if (errorCall) {
        // check resouces
        let res:any = cc.loader.getRes(key)
        if (!res) {
          errorCall && errorCall('cannot find depondes resources: ' + key)
        }
      }
    }
  }

  /**
   * 开始加载资源
   * @param successCall    加载成功回调
   * @param failedCall     加载失败回调
   * @param errorCall      错误回调（LOG）
   * @param progressCall   加载进度回调
   */
  load (successCall: SUCCESS_CALL, failedCall:FAILED_CALL, errorCall:ERROR_CALL, progressCall:PROGRESS_CALL) {
    this._loadedCompleted = false
    let completedCallFunc = (error: Error, resources: any[])=>{
      if (!error) {
        if (this._loadedCompleted) {
          let err: Error = new Error('loaderItem call back after it has been completed!!!')
          if (errorCall) {
            errorCall(err.message + err.stack)
          } else {
            console.error(err.message, err.stack)
          }
          return
        }
        this._loadedCompleted = true
        for (let res of resources) {
          this._cacheRes(res, errorCall)
        }
        if (successCall) {
          if (this._singleFile) {
            successCall(resources[0])
          } else {
            successCall(resources)
          }
        }
      } else {
        if (this.maxRetryTimes === this._currentRetryTimes) {
          if (errorCall) {
            let errStr: string = 'faild load resouces: loading::['
            errStr += this.urls.join(';') + ']\n\n'
            errStr += error.message + (error.stack || '')
            errorCall(errStr)
          } else {
            console.error(error.message, error.stack)
          }
          failedCall && failedCall(error)
        } else {
          this._currentRetryTimes += 1

          let errStr: string = 'faild load resouces: loading::['
          errStr += this.urls.join(';') + ']\n\n'
          errStr += error.message + (error.stack || '')
          if (this.maxRetryTimes < 0 && this._currentRetryTimes === 3) {
            if (errorCall) {
              errorCall(errStr)
            } else {
              console.error(errStr)
            }
          } else {
            console.warn(errStr)
          }
          return this.load(successCall, failedCall, errorCall, progressCall)
        }
      }
    }
    let callFuncArgs: any[] = [this.urls]
    this.type && callFuncArgs.push(this.type)
    progressCall && callFuncArgs.push(progressCall)
    callFuncArgs.push(completedCallFunc)
    cc.loader.loadResArray.apply(cc.loader, callFuncArgs)
  }

  /**
   * 释放资源
   */
  release () {
    this.isReleased = true
    let resources: string[] = Object.keys(this.resources)
    cc.loader.release(resources)
    this.resources = {}
    // console.log('load item release resouces: ', new Date().getTime(), resources)
  }

  /**
   * 释放资源
   * @param otherDepends  其它依赖项，释放资源会跳过这些资源
   */
  releaseWithout (otherDepends: Object) {
    for (let reference in this.resources) {
      if (otherDepends[reference]) {
        delete this.resources[reference]
      }
    }
    this.release()
  }

  /**
   * 记录条目使用的所有资源
   * @param resouces  将该条目中使用的所有资源记录到Object中
   */
  mergeResouces (resouces: Object) {
    for (let reference in this.resources) {
      resouces[reference] = true
    }
  }
}

class DataItemLoader extends LoaderItem {
  data: any = null

  constructor (data: Object, retryTimes: number) {
    super([], null, retryTimes)
    this.data = data
  }

  /**
   * 开始加载资源
   * @param successCall    加载成功回调
   * @param failedCall     加载失败回调
   * @param errorCall      错误回调（LOG）
   * @param progressCall   加载进度回调
   */
  load (successCall: SUCCESS_CALL, failedCall:FAILED_CALL, errorCall:ERROR_CALL, progressCall:PROGRESS_CALL) {
    this._loadedCompleted = false
    let completedCallFunc = (error: Error, resources: any)=>{
      if (!error) {
        if (this._loadedCompleted) {
          let err: Error = new Error('loaderItem call back after it has been completed!!!')
          if (errorCall) {
            errorCall(err.message + err.stack)
          } else {
            console.error(err.message, err.stack)
          }
          return
        }
        this._loadedCompleted = true
        this._cacheRes(resources, errorCall)
        if (successCall) {
          successCall(resources)
        }
      } else {
        if (this.maxRetryTimes === this._currentRetryTimes) {
          if (errorCall) {
            let errStr: string = 'faild load resouces: loading::['
            errStr += this.urls.join(';') + ']\n\n'
            errStr += error.message + (error.stack || '')
            errorCall(errStr)
          } else {
            console.error(error.message, error.stack)
          }
          failedCall && failedCall(error)
        } else {
          this._currentRetryTimes += 1

          let errStr: string = 'faild load resouces: loading::['
          errStr += this.urls.join(';') + ']\n\n'
          errStr += error.message + (error.stack || '')
          if (this.maxRetryTimes < 0 && this._currentRetryTimes === 3) {
            if (errorCall) {
              errorCall(errStr)
            } else {
              console.error(errStr)
            }
          } else {
            console.warn(errStr)
          }
          return this.load(successCall, failedCall, errorCall, progressCall)
        }
      }
    }
    let callFuncArgs: any[] = [this.data]
    progressCall && callFuncArgs.push(progressCall)
    callFuncArgs.push(completedCallFunc)
    cc.loader.load.apply(cc.loader, callFuncArgs)
  }
}

export default class Loader {
  private static _mainInstance: Loader = null
  public static getMain (): Loader {
    if (!this._mainInstance) {
      this._mainInstance = new Loader()
    }
    return this._mainInstance
  }

  private static _sinstanceId: number = 0        // 当前使用到的instanceId 
  private _parentLoader: Loader = null           // 父管理器
  private _subLoaders: Loader[] = null           // 子管理器
  private _loadItems: LoaderItem[] = null        // 所有的资源加载项

  private _logger: any = null                    // 日志打印对象

  private _released: boolean  = false            // 是否被释放
  private _instanceId: number = -1               // 唯一ID，用来区分对象实例，无实际作用

  private _loadedUrls: Object = null

  constructor () {
    this._instanceId   = Loader._sinstanceId++
    this._loadItems    = []
    this._subLoaders   = []
    this._released     = false
    this._loadedUrls   = {}
  }

  /**
   * 获取到根管理器
   */
  get rootLoader (): Loader {
    let root: Loader = this
    while (root._parentLoader) {
      root = root._parentLoader
    }
    return root
  }

  setLogger (log:any) {
    this._logger = log
  }

  /**
   * 创建子管理器
   */
  createSubLoader (): Loader {
    let loader = new Loader()
    loader._parentLoader = this
    this._subLoaders.push(loader)
    return loader
  }

  mergeResouces (resouces:Object, skips:Loader[] = null) {
    for (let item of this._loadItems) {
      item.mergeResouces(resouces)
    }

    for (let loader of this._subLoaders) {
      if (!skips || skips.indexOf(loader) === -1) {
        loader.mergeResouces(resouces)
      }
    }
  }
  
  /**
   * 获取所有使用到的资源
   * @param skips  跳过对象
   */
  getAllResources (skips:Loader[] = null):Object {
    let resouces: Object = {}
    if (!skips || skips.indexOf(this) === -1) {
      this.mergeResouces(resouces, skips)
    }
    return resouces
  }

  private _checkAllLoaded (urls: string[]): boolean {
    for (let url of urls) {
      if (!this._loadedUrls[url]) {
        return false
      }
    }
    return true
  }

  loadItem (data: Object, succCall: SUCCESS_CALL = null, failCall: FAILED_CALL = null, retryTimes:number = 0, progressCall:PROGRESS_CALL = null) {
    let item: LoaderItem = new DataItemLoader(data, retryTimes)
    item.load((res:any[]|any)=>{
      if (this._released|| item.isReleased) {
        // 释放刚加载的资源，需在下一Tick释放，保证其它加载成功
        return callInNextTick (()=>{
          item.releaseWithout(this.rootLoader.getAllResources())
        })
      }
      return succCall && succCall(res)
    }, (error:Error)=>{
      if (this._released) return
      failCall && failCall(error)
    }, (error:string)=>{
      console.error(error)
      if (this._logger) {
        this._logger.slog(error)
      }
    }, progressCall)
    this._loadItems.push(item)
  }

  /**
   * 
   * @param urls            加载资源项
   * @param type            加载资源类型
   * @param succCall        加载成功回调
   * @param failCall        加载失败回调
   * @param retryTimes      重试次数
   * @param progressCall    加载进度回调
   */
  load (urls: string[]|string, type:typeof cc.Asset, succCall: SUCCESS_CALL = null, failCall: FAILED_CALL = null, retryTimes:number = 0, progressCall:PROGRESS_CALL = null) {
    if (typeof urls === 'string') {
      urls = [urls]
    }
    if (this._checkAllLoaded(urls)) {
      let callFuncArgs: any[] = [urls]
      type && callFuncArgs.push(type)
      progressCall && callFuncArgs.push(progressCall)
      let completedCallFunc = (error: Error, resources: any[])=>{
        if (error) {
          failCall && failCall(error)
        } else {
          succCall && succCall(resources)
        }
      }
      callFuncArgs.push(completedCallFunc)
      return cc.loader.loadResArray.apply(cc.loader, callFuncArgs)
    }
    let item: LoaderItem = new LoaderItem(urls, type, retryTimes)
    item.load((res:any[]|any)=>{
      if (this._released|| item.isReleased) {
        // 释放刚加载的资源，需在下一Tick释放，保证其它加载成功
        return callInNextTick (()=>{
          item.releaseWithout(this.rootLoader.getAllResources())
        })
      }
      for (let url of urls) {
        this._loadedUrls[url] = 1
      }
      return succCall && succCall(res)
    }, (error:Error)=>{
      if (this._released) return
      failCall && failCall(error)
    }, (error:string)=>{
      console.error(error)
      if (this._logger) {
        this._logger.slog(error)
      }
    }, progressCall)
    this._loadItems.push(item)
  }

  /**
   * 释放管理器
   */
  release () {
    this._released = true
    this._parentLoader._removeSubLoader(this)
    // 释放当前加载的所有资源，需在当前Tick释放，以让后续的加载请求生效
    let allResouces: Object = this.rootLoader.getAllResources()
    this._releaseWithout(allResouces)
  }

  /**
   * 清空所有当前加载器资源
   */
  clear () {
    let allResouces: Object = this.rootLoader.getAllResources([this])
    this._releaseWithout(allResouces)
  }

  /**
   * 移除子管理器
   * @param loader  需移除的子管理器
   */
  private _removeSubLoader (loader:Loader) {
    let index: number = this._subLoaders.indexOf(loader)
    if (index >= 0) {
      this._subLoaders.splice(index, 1)
    }
  }

  /**
   * 选择性释放资源
   * @param allResouces   不能被释放的资源
   */
  private _releaseWithout (allResouces: Object = null) {
    for (let item of this._loadItems) {
      item.releaseWithout(allResouces)
    }
    this._loadItems.length = 0

    for (let loader of this._subLoaders) {
      loader._releaseWithout(allResouces)
    }
  }
}
