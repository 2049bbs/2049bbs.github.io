
const fetch = require("node-fetch").default
const { Octokit } = require("@octokit/rest")

const octokit = new Octokit({
    auth: process.env.AUTH_TOKEN
})

const GIST = process.env.GIST

const getCookie = async () => {
    const { data } = await octokit.gists.get({
        gist_id: GIST,
    })
    const cookie = data.files["cookie"].content
    return cookie
}

const regenerateCookie = async (cookie) => {
    const r = await fetch("https://2049bbs.xyz", {
        headers: {
            Cookie: cookie
        }
    })
    const cookies = r.headers.get("set-cookie")
    return cookies.match(/SessionID=.+?(;|$)/)[0]
}

getCookie().then(regenerateCookie).then(c => {
    console.log(c)
    return octokit.gists.update({
        gist_id: GIST,
        files: {
            "cookie": {
                content: c
            }
        }
    })
})

