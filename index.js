const path = require("path");
const fsp = require("fs/promises");
const {EventEmitter} = require("events");
/**
 * @typedef {Object} DirWatcherStats
 * @property {"block" | "char" | "dir" | "pipe" | "file" | "socket" | "symlink"} type
 * @property {number} dev
 * @property {number} ino
 * @property {number} mode
 * @property {number} nlink
 * @property {number} uid
 * @property {number} gid
 * @property {number} rdev
 * @property {number} size
 * @property {number} blksize
 * @property {number} blocks
 * @property {number} atimeMs
 * @property {number} mtimeMs
 * @property {number} ctimeMs
 * @property {number} birthtimeMs
 * @property {Date} atime
 * @property {Date} mtime
 * @property {Date} ctime
 * @property {Date} birthtime
 * @property {Array<string>} [files] (Only available if type is "dir")
 * @property {string} [destination] (Only available if type is "symlink")
 */

/**
 * @typedef {Object} StatDirWatcherOptions
 * @property {boolean} [persistent=false]
 * @property {boolean} [recursive=false]
 * @property {number} [interval=5007]
 */
class StatDirWatcher extends EventEmitter {
	/**
	 *
	 * @param {string} dir
	 * @param {StatDirWatcherOptions} options
	 */
	constructor(dir, options){
		super();
		/**
		 * @type {Map<string, DirWatcherStats>}
		 * The cached stats, mapped by their path. Note that while the objects within may be replaced, the map itself
		 * will not.
		 */
		this.cachedStats = new Map();
		/** @type {Map<string, DirWatcherStats>} @private */
		this._newCachedStats = new Map();
		/** @type {Set<string>} */
		this._unchangedPaths = new Set();
		/** @private */
		this._externalStatPropertyPromises = [];
		/** @private */
		this._dir = path.resolve(dir);
		/** @private */
		this._recursive = !!options.recursive;
		/** @private */
		this._timeout = setTimeout(this.tick.bind(this), options.interval ?? 5007);
		/** @private */
		this._initialized = false;
		/** @private */
		this._ticking = false;
		/* istanbul ignore next */
		if(!options.persistent){
			this._timeout.unref();
		}
	}
	/**
	 * Looks up the specified path, following any symbolic links
	 * @param {string} filePath
	 */
	lookupStat(filePath){
		throw new Error("TODO");
	}
	/**
	 * @param {string} path
	 * @param {Object | Promise<Object>} obj Object to copy properties to the new stat
	 */
	addToNewCachedStat(path, obj){
		if(!this._ticking){
			throw new Error("You should only call this function in a preChange event");
		}
		this._externalStatPropertyPromises.push((async() => {
			Object.assign(this._newCachedStats.get(path), await obj);
		})());
	}
	/* istanbul ignore next */
	ref(){
		this._timeout.ref();
	}
	/* istanbul ignore next */
	unref(){
		this._timeout.unref();
	}
	/**
	 * @private
	 * @param {string} filePath
	 */
	async _doStatThing(filePath, recurse = true){
		try{
			const oldResultStat = this.cachedStats.get(filePath);
			const stat = await fsp.lstat(filePath);
			/** @type {DirWatcherStats} */
			const resultStat = {};
			if(stat.isDirectory()){
				resultStat.type = "dir";
				resultStat.files = await fsp.readdir(filePath);
				if(recurse){
					await Promise.all(resultStat.files.map(fileName => this._doStatThing(
						filePath + path.sep + fileName,
						this._recursive
					)));
				}
			}
			if(oldResultStat != null && oldResultStat.ctime >= stat.ctime){
				this._unchangedPaths.add(filePath);
				return;
			}
			Object.assign(resultStat, stat);
			if(stat.isBlockDevice()){
				resultStat.type = "block";
			}else if(stat.isCharacterDevice()){
				resultStat.type = "char";
			}else if(stat.isFIFO()){
				resultStat.type = "pipe";
			}else if(stat.isFile()){
				resultStat.type = "file";
			}else if(stat.isSocket()){
				resultStat.type = "socket";
			}else if(stat.isSymbolicLink()){
				resultStat.type = "symlink";
				resultStat.destination = await fsp.readlink(filePath);
				/* istanbul ignore next */
			}else if(!stat.isDirectory()){
				throw new Error("this shouldn't happen");
			}
			this._newCachedStats.set(filePath, resultStat);
			this.emit("preChange", filePath, oldResultStat);
		}catch(ex){
			if(ex.code !== "ENOENT" && ex.code !== "EACCES"){
				throw ex;
			}
		}
	}
	/**
	 * @private
	 */
	async tick(){
		/* TODO: It's more performant if we watched each individual instead of stat polling. However, there are issues
		   with watching directories, i.e. a file within the directory having the same name as the directory itself */
		try{
			this._externalStatPropertyPromises.length = 0;
			this._ticking = true;
			await this._doStatThing(this._dir);
			this._ticking = false;
			await Promise.all(this._externalStatPropertyPromises);
			this._externalStatPropertyPromises.length = 0;
			this._newCachedStats.forEach((resultStat, filePath) => {
				const oldResultStat = this.cachedStats.get(filePath) || null;
				this.cachedStats.set(filePath, resultStat);
				if(this._initialized){
					this.emit("change", filePath, oldResultStat, resultStat);
				}
			});
			this.cachedStats.forEach((oldResultStat, filePath) => {
				if(!this._unchangedPaths.has(filePath) && !this._newCachedStats.has(filePath)){
					this.cachedStats.delete(filePath);
					this.emit("change", filePath, oldResultStat, null);
				}
			});
			this._newCachedStats.clear();
			this._unchangedPaths.clear();
			this._initialized = true;
		}catch(ex){
			process.emit("warning", ex);
		}
		/* istanbul ignore next */
		if(this._timeout){
			this._timeout.refresh();
		}
	}
	/**
	 * stops watching
	 */
	stop(){
		clearTimeout(this._timeout);
		delete this._timeout;
		this.removeAllListeners();
	}
}
module.exports = {StatDirWatcher};
