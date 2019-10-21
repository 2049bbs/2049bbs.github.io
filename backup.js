// @ts-check

const youbbsBackupHelper = require("youbbs-backup-helper")
const { move, readdir, ensureDir, unlink, existsSync, pathExists, readFile } = require("fs-extra")
const path = require("path")

/** @typedef {import("youbbs-backup-helper/src/types").Article} Article */
/** @typedef {import("youbbs-backup-helper/src/types").Category} Category */
/** @typedef {import("youbbs-backup-helper/src/types").User} User */

const baseURL = "https://2049bbs.xyz"
const outputDir = "tmp"

/**
 * @param {string} src 
 * @param {string} dest 
 */
const moveR = async (src, dest) => {
    const files = await readdir(src)
    await Promise.all(
        files.map(async (f) => {
            await ensureDir(path.dirname(path.join(dest, f)))
            await move(path.join(src, f), path.join(dest, f), { overwrite: true })
        })
    )
}

/**
 * @param {string} dir 
 */
const _readDir = async (dir) => {
    if (await pathExists(dir)) {
        return readdir(dir)
    } else {
        return []
    }
}

const categoryBackupHelper = new youbbsBackupHelper({
    baseURL,
    outputDir,
    types: ["category"],
    serializer: "markdown",
    maxConcurrent: 10,
})

/** @type {Map<number, Category>} */
const categories = new Map()

categoryBackupHelper.pipe(
    /** @param {Category} obj */
    (obj) => {
        categories.set(obj.cid, obj)
        return obj
    }
)

/** @type {Map<number, Date[]>} */
const addTimes = new Map()
const addTimeReg = /^\s*addTime: (\d{4}-\d{2}-\d{2}.*)/mg

const readPostAddTimes = () => {
    return _readDir("_posts").then(async (files) => {
        return await Promise.all(
            files.map(async (f) => {
                const data = await readFile(`_posts/${f}`, "utf-8")
                const aid = +f.match(/(\d+).md/)[1]
                const addTimeList = Array.from(data.matchAll(addTimeReg), m => new Date(m[1]))
                addTimes.set(aid, addTimeList)
            })
        )
    })
}

Promise.all([
    categoryBackupHelper.start(),
    readPostAddTimes()
]).then(() => {

    const helper = new youbbsBackupHelper({
        baseURL,
        outputDir,
        types: ["article"],
        serializer: "markdown",
        maxConcurrent: 4,
    })

    helper.setFileNameFn(
        /**
         * @param {Article} obj
         */
        (obj, id, fileExt) => {
            if (addTimes.has(id) && addTimes.get(id).length > 0) {
                obj.addTime = addTimes.get(id)[0]
            }
            const date = obj.addTime.toISOString().match(/^(.+)T/)[1]
            return `${date}-${id}.${fileExt}`
        }
    )

    helper.pipe(
        /**
         * @param {Article} obj
         */
        async (obj) => {
            if (addTimes.has(obj.aid)) {
                const addTimeList = addTimes.get(obj.aid)
                if (addTimeList.length > 0) {
                    const [postAddTime, ...commentAddTimeList] = addTimeList
                    obj.addTime = postAddTime
                    commentAddTimeList.forEach((value, index) => {
                        obj.comments[index].addTime = value
                    })
                }
            }

            // update time
            if (obj.comments.length > 0) {
                obj["date"] = obj.comments[obj.comments.length - 1].addTime
            } else {
                obj["date"] = obj.addTime
            }

            const { cid } = obj
            const cJson = categories.get(cid)
            const category = cJson.name
            obj["category"] = category

            obj.content = obj.content.replace(/{{/g, "{ {")  // add U+200A HAIR SPACE
                .replace(/}}/g, "} }")
                .replace(/{%/g, "{ %")
                .replace(/%}/g, "% }")

            return obj
        }
    )

    return helper.start()

}).then(async () => {
    await moveR(`${outputDir}/article`, "_posts")
    await moveR(`${outputDir}/category`, "_category_info")
})

/** @type {Map<number, Date>} */
const usersRegTime = new Map()

_readDir("_users").then(async (files) => {
    await Promise.all(
        files.map(async (f) => {
            const data = await readFile(`_users/${f}`, "utf-8")
            const userID = parseInt(f.match(/(\d+).md/)[1])
            const regTime = new Date(data.match(/^regTime: (\d{4}-\d{2}-\d{2}.*)/m)[1])
            usersRegTime.set(userID, regTime)
        })
    )
}).then(() => {
    const userBackupHelper = new youbbsBackupHelper({
        baseURL,
        outputDir,
        types: ["user"],
        serializer: "markdown",
        maxConcurrent: 4,
    })
    userBackupHelper.pipe(
        /**
         * @param {User} obj
         */
        async (obj) => {
            const url = obj.url
            delete obj.url
            obj["userURL"] = url

            if (usersRegTime.has(obj.userID)) {
                obj.regTime = usersRegTime.get(obj.userID)
            }

            return obj
        }
    )
    userBackupHelper.setFileNameFn(
        /**
         * @param {User} obj
         */
        (obj, id, fileExt) => {
            if (obj.avatar.length < 100 || !obj.avatar.startsWith("data:image/")) {
                return ".fail"
            } else {
                return `${id}.${fileExt}`
            }
        }
    )
    userBackupHelper.start().then(() => {
        const failFile = `${outputDir}/user/.fail`
        if (existsSync(failFile)) {
            unlink(failFile)
        }
        return moveR(`${outputDir}/user`, "_users")
    })
})
