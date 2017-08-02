import { database } from './main'
import geohash from './util/geohash'
import sjcl from '../node_modules/sjcl/sjcl'

const GEOHASH_PRECISION = 5

export default {
  commentRef: null,
  regionsRef: null,
  regionRefs: [],
  createPost (post, position) {
    let regionId = geohash.encode(
      position.lat,
      position.lng,
      GEOHASH_PRECISION
    )
    regionId = regionId.split('').join('/')
    const timestamp = Date.now()
    const newPostRef = database.ref(`regions-posts/${regionId}/${post.id}`)
    return new Promise((resolve, reject) => {
      let newPost = {
        createdAt: timestamp,
        lat: position.lat,
        lng: position.lng,
        text: post.text,
        username: post.username
      }
      if (post.imagesUrls.length > 0) {
        newPost.imagesCount = post.imagesUrls.length
      }
      if (post.adminKey.length > 0) {
        newPost.adminKey = sjcl.encrypt(post.adminKey, post.adminKey)
      }
      if (post.cypherKey.length > 0) {
        newPost.cypherKey = sjcl.encrypt(post.cypherKey, post.cypherKey)
        newPost.text = sjcl.encrypt(post.cypherKey, post.text)
      }
      newPostRef
      .set(newPost)
      .then((value) => {
        resolve(value)
      })
      .catch((error) => {
        reject(error)
      })
    })
  },
  getPosts (regionId, newPostCallback, postRemovedCallback) {
    if (regionId.length < GEOHASH_PRECISION * 2 - 1) {
      this.regionsRef = database.ref('regions-posts/' + regionId)
      this.regionsRef.on('child_added', (data) => {
        this.getPosts(`${regionId}/${data.key}`, newPostCallback, postRemovedCallback)
      })
    } else {
      const regionRef = database.ref('regions-posts/' + regionId)
      regionRef.on('child_added', (data) => {
        newPostCallback(data.key, data.val())
      })
      regionRef.on('child_removed', (data) => {
        postRemovedCallback(data.key)
      })
      this.regionRefs.push(regionRef)
    }
  },
  verifyPassword (encryptedPassword, password) {
    try {
      if (!(password || encryptedPassword)) return true
      if (sjcl.decrypt(password, encryptedPassword) === password) return true
      return false
    } catch (e) {
      return false
    }
  },
  decrypt (password, data) {
    return sjcl.decrypt(password, data)
  },
  removeRegionsListeners () {
    if (this.regionsRef) this.regionsRef.off()
    this.regionRefs.map((ref) => {
      ref.off()
    })
    this.regionRefs = []
  },
  deletePost (post) {
    return new Promise((resolve, reject) => {
      const regionId = geohash.encode(post.lat, post.lng, GEOHASH_PRECISION)
      database
      .ref(`regions-posts/${regionId}/${post.id}`)
      .remove()
      .then((value) => {
        resolve(value)
      })
      .catch((error) => {
        reject(error)
      })
    })
  },
  comment (post, comment) {
    if (!this.commentRegionId) {
      return new Promise((resolve, reject) => { reject('no region') })
    }
    const newComment = {
      createdAt: Date.now(),
      username: comment.username,
      text: comment.text
    }
    if (post.isPrivate) {
      newComment.username = sjcl.encrypt(
        post.cypherKey,
        comment.username
      )
      newComment.text = sjcl.encrypt(
        post.cypherKey,
        comment.text
      )
    }
    const newCommentRef = database
    .ref(`regions-comments/${this.commentRegionId}/${post.id}`).push()
    return new Promise((resolve, reject) => {
      newCommentRef
      .set(newComment)
      .then((value) => {
        database
        .ref(`regions-posts/${this.commentRegionId}/${post.id}`)
        .transaction((post) => {
          if (post.commentsCount === undefined) post.commentsCount = 1
          else post.commentsCount++
          return post
        })
        resolve(value)
      })
      .catch((error) => {
        reject(error)
      })
    })
  },
  getComments (post, newCommentCallback) {
    this.commentRegionId = geohash.encode(
      post.lat,
      post.lng,
      GEOHASH_PRECISION
    )
    this.commentsRef = database
    .ref(`regions-comments/${this.commentRegionId}/${post.id}`)
    this.commentsRef.on('child_added', (data) => {
      let comment = data.val()
      if (post.isPrivate) {
        comment.username = sjcl.decrypt(
          post.cypherKey,
          comment.username
        )
        comment.text = sjcl.decrypt(
          post.cypherKey,
          comment.text
        )
      }
      newCommentCallback(comment)
    })
  },
  removeCommentsListener () {
    if (this.commentsRef) this.commentsRef.off()
  },
  setUsername (username) {
    /* global localStorage */
    /* eslint no-undef: "error" */
    localStorage.setItem('username', username)
  },
  getUsername () {
    return localStorage.getItem('username')
  },
  setLocation (location) {
    localStorage.setItem('location', JSON.stringify(location))
  },
  getLocation () {
    if (localStorage.getItem('location')) {
      return JSON.parse(localStorage.getItem('location'))
    } else return { lat: 40.7414835, lng: -73.976287 }
  },
  setZoom (zoom) {
    localStorage.setItem('zoom', zoom)
  },
  getZoom () {
    if (localStorage.getItem('zoom')) {
      return parseInt(localStorage.getItem('zoom'))
    } else return 13
  }
}
