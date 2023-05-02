import { ref } from 'vue'

import Request from '@/lib/request'
import { copy } from '@/lib/tool'
import { StaticUrl } from '@/lib/constance'

const request = new Request({ host: StaticUrl })
const AliasApi = new Request({ host: 'https://alias.arkfans.top/' })

const CharDict = {}
const loaded = []
const Suffix = (navigator.userAgent.indexOf('Chrome') === -1 && navigator.userAgent.indexOf('Safari') !== -1)
    ? '.png'
    : '.webp'

function parseAvatarUrl (url, series, charId) {
    return 'avatar/' +
        encodeURIComponent(series) + '/' +
        encodeURIComponent(url.indexOf('id:') === 0 ? url.slice(3) : charId + url) +
        Suffix
}

function loadChar (series) {
    if (loaded.indexOf(series) !== -1) {
        return
    }
    request.get({
        url: 'version/' + series + '.txt?t=' + Date.now(),
        success: (resp) => {
            request.get({
                url: 'char/' + series + '.json?v=' + resp.data,
                success: (resp) => {
                    loaded.push(series)
                    for (const charId in resp.data) {
                        if (!Object.prototype.hasOwnProperty.call(resp.data, charId)) {
                            continue
                        }
                        const data = resp.data[charId]
                        for (const avatarId in data.avatars) {
                            if (!Object.prototype.hasOwnProperty.call(data.avatars, avatarId)) {
                                continue
                            }
                            data.avatars[avatarId] = parseAvatarUrl(data.avatars[avatarId], series, charId)
                        }
                        data.series = series
                        CharDict[charId] = data
                    }
                }
            })
        }
    })
}

// const seriesSort = {
//     Default: 1
// }

const TagSort = {
    operator: 1001,
    token: 1002,
    trap: 1003,
    enemy: 1004
}

function sortByLength (a, b, lang) {
    const A = a.names[lang]
    const B = b.names[lang]
    if (!A) {
        return 1
    } else if (!B) {
        return -1
    }
    return A.length - B.length
}

function sortBySeries (a, b) {
    return (TagSort[a.series] || 100) - (TagSort[b.series] || 100)
}

function sortByTag (a, b) {
    for (let i = 0; i < a.tags.length && i < b.tags.length; i++) {
        if (a.tags[i] === b.tags[i]) {
            continue
        }
        return TagSort[a.tags[i]] - TagSort[b.tags[i]]
    }
    return 0
}

function firstSort (a, b, lang) {
    return sortBySeries(a, b) || sortByTag(a, b) || sortByLength(a, b, lang)
}

const sortDict = {
    zh_CN: (a, b) => {
        const A = a.names.fpy
        const B = b.names.fpy
        if (A === B) {
            return 0
        } else {
            return A > B ? 1 : -1
        }
    }
}

function sortChar (list, lang) {
    sortDict[lang]
        ? list.sort((a, b) => {
            const A = CharDict[a]
            const B = CharDict[b]
            return firstSort(A, B, lang) || sortDict[lang](A, B)
        })
        : list.sort((a, b) => {
            const A = CharDict[a]
            const B = CharDict[b]
            return firstSort(A, B, lang)
        })
}

const searchResult = ref(false)
const AliasAddition = ref([])

let searchResultFullShow = 0

const SearchManager = class SearchManager {
    constructor (search, t, list, lang = 'zh_CN') {
        this.search = search
        this.t = t
        this.raw_list = copy(list)
        this.list = list
        for (const charId of AliasAddition.value) {
            if (this.list.indexOf(charId) === -1) {
                this.list.push(charId)
            }
        }
        this.lang = lang
        this.res = []
        self.showed = false
    }

    sort () {
        sortChar(this.list, this.lang)
    }

    gen () {
        this.res = []
        for (let i = 0; i < this.list.length; i++) {
            const charId = this.list[i]
            for (let j = 0; j < CharDict[charId].avatars.length; j++) {
                this.res.push([CharDict[charId].avatars[j], CharDict[charId].avatars[j], CharDict[charId].names[this.lang]])
            }
        }
    }

    show () {
        if (this.res) {
            // 优化：延迟输出
            // TODO use virtual list
            if (this.res.length > 400) {
                searchResult.value = this.res.slice(0, 40)
                setTimeout(() => {
                    if (searchResultFullShow === this.t) {
                        searchResult.value = this.res
                    }
                    this.showed = true
                }, 1000)
            } else if (this.res.length > 40) {
                searchResult.value = this.res.slice(0, 40)
                setTimeout(() => {
                    if (searchResultFullShow === this.t) {
                        searchResult.value = this.res
                    }
                    this.showed = true
                }, 200)
            } else {
                searchResult.value = this.res
                this.showed = true
            }
        } else {
            searchResult.value = false
            this.showed = true
        }
    }

    searchAlias (success, error) {
        if (AliasApi.cancelTokens.length) {
            for (const item of AliasApi.cancelTokens) {
                item.cancel()
            }
            AliasApi.cancelTokens = []
        }
        AliasApi.get({
            url: 'alias/search?lang=7&output=4&type=39&mode=14&text=' + encodeURIComponent(this.search),
            success,
            error
        })
    }

    aliasHandler (callback) {
        return (response) => {
            this.list = this.raw_list
            AliasAddition.value = []
            callback && callback(response)
            this.sort()
            this.gen()
            if (this.showed && this.t === searchResultFullShow) {
                searchResult.value = this.res
            }
        }
    }

    run () {
        this.sort()
        this.gen()
        this.show()
        this.searchAlias(this.aliasHandler((resp) => {
            for (const charId of resp.data) {
                if (Object.prototype.hasOwnProperty.call(CharDict, charId)) {
                    if (this.list.indexOf(charId) === -1) {
                        this.list.push(charId)
                    }
                    AliasAddition.value.push(charId)
                }
            }
        }), this.aliasHandler())
    }
}

function parseSearch (search) {
    // TODO i18n 根据lang决定是否处理
    // 部分输入法拼音输入阶段会携带” ' “，导致拼音搜索失效
    search = search.replaceAll('\'', '')
    // “6/MSP” 不清楚此字符为何，但出现在部分输入法拼音输入阶段
    search = search.replaceAll(' ', '')
    return search
}

function searchCharHandler (search) {
    search = parseSearch(search)
    const t = Date.now()
    searchResultFullShow = t
    if (search) {
        const searchLower = search.toLowerCase()
        const list = []
        for (const charId in CharDict) {
            if (Object.prototype.hasOwnProperty.call(CharDict, charId)) {
                const char = CharDict[charId]
                for (const lang in char.names) {
                    if (Object.prototype.hasOwnProperty.call(char.names, lang)) {
                        if (char.names[lang].indexOf(searchLower) !== -1) {
                            list.push(charId)
                            break
                        }
                    }
                }
            }
        }
        const manager = new SearchManager(search, t, list)
        manager.run()
    } else {
        AliasAddition.value = []
        searchResult.value = [
            ['博士', 'avatar/Default/doctor' + Suffix, '博士'],
            ['PRTS', 'avatar/Default/PRTS' + Suffix, 'PRTS'],
            ['mon3tr', 'avatar/Default/mon3tr' + Suffix, 'mon3tr'],
            ['凯尔希', 'avatar/Default/char_003_kalts' + Suffix, '凯尔希']
        ]
    }
}

export {
    CharDict,
    loadChar,
    sortChar,
    searchResult,
    searchCharHandler
}
