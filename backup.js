// @ts-check

const youbbsBackupHelper = require("youbbs-backup-helper")
const { readJSON, move, readdir } = require("fs-extra")
const path = require("path")

/** @typedef {import("youbbs-backup-helper/src/types").Article} Article */
/** @typedef {import("youbbs-backup-helper/src/types").Category} Category */

const baseURL = "https://2049bbs.xyz"
const outputDir = "tmp"

/**
 * @param {string} src 
 * @param {string} dest 
 */
const moveR = async (src, dest) => {
    const files = await readdir(src)
    await Promise.all(
        files.map((f) => {
            move(path.join(src, f), path.join(dest, f), { overwrite: true })
        })
    )
}

new youbbsBackupHelper({
    baseURL,
    outputDir,
    types: ["category"],
    serializer: "json",
    maxConcurrent: 10,
}).start().then(() => {

    const helper = new youbbsBackupHelper({
        baseURL,
        outputDir,
        types: ["article"],
        serializer: "markdown",
        maxConcurrent: 20,
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
            const time = obj.addTime
            delete obj.addTime
            obj["date"] = time

            const { cid } = obj
            /** @type {Category} */
            const cJson = await readJSON(`${outputDir}/category/${cid}.json`)
            const category = cJson.name
            obj["category"] = category

            return obj
        }
    )

    return helper.start()

}).then(async () => {
    await moveR(`${outputDir}/article`, "_posts")
    await moveR(`${outputDir}/category`, "categories")
})

new youbbsBackupHelper({
    baseURL,
    outputDir,
    types: ["user"],
    serializer: "markdown",
    maxConcurrent: 20,
}).start().then(() => {
    return moveR(`${outputDir}/user`, "users")
})

