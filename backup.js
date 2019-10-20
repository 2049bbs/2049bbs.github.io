// @ts-check

const youbbsBackupHelper = require("youbbs-backup-helper")
const { move, readdir, ensureDir, unlink, existsSync } = require("fs-extra")
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

categoryBackupHelper.start().then(() => {

    const helper = new youbbsBackupHelper({
        baseURL,
        outputDir,
        types: ["article"],
        serializer: "markdown",
        maxConcurrent: 10,
    })

    helper.setFileNameFn(
        /**
         * @param {Article} obj
         */
        (obj, id, fileExt) => {
            const date = obj.addTime.toISOString().match(/^(.+)T/)[1]
            return `${date}-${id}.${fileExt}`
        }
    )

    helper.pipe(
        /**
         * @param {Article} obj
         */
        async (obj) => {
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

const userBackupHelper = new youbbsBackupHelper({
    baseURL,
    outputDir,
    types: ["user"],
    serializer: "markdown",
    maxConcurrent: 10,
})
userBackupHelper.pipe(
    /**
     * @param {User} obj
     */
    async (obj) => {
        const url = obj.url
        delete obj.url
        obj["userURL"] = url

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

