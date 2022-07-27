import type { PrismaClient } from '@prisma/client'

export interface CacheOptions {
  expires?: number
}

export interface CacheLatestOptions extends CacheOptions {
  model?: PrismaClient
}

export type LatestQuery = Record<string, unknown>

export type Cacheable = () => unknown

// Cache any data you want (as long as it can survive JSON.stringify -> JSON.parse)
//
// Can be a string, number, etc, or a function. The return of the function
// is what will be cached.
//
// If not given an expiration time (in seconds) it will be cached forever,
// or until the cache process decides to throw it out:
//
//   cache('posts', () => db.post.findMany())
//
// (This particular cache would be better suited to the `cacheLatest()` function
// which will automatically update the cache when any record in the resultset
// is updated.)
//
// You can set a number of seconds for the cache to live before it's purged:
//
//   cache('posts', () => db.post.findMany(), { expires: 30 } )
//
export const cache = async (
  key: string,
  input: Cacheable,
  options?: CacheOptions
) => {
  try {
    const { Client } = await import('memjs')
    const memjs = Client.create()
    const result = await memjs.get(key)

    // value will be `null` if cache MISS
    if (result.value) {
      console.debug(`Cache HIT ${key}`)
      return JSON.parse(result.value.toString())
    }

    let data

    try {
      console.debug(`Cache MISS ${key}`)
      data = await input()
      await memjs.set(key, JSON.stringify(data), options || {})
      return data
    } catch (e) {
      console.error('Error in cache SET', e)
      return data || (await input())
    }
  } catch (e) {
    console.error('Error in cache GET', e)
    return await input()
  }
}

// Cache a resultset based on latest record that matches a given where clause.
// Instead of calling the function you want to cache directly, you need to give
// this function the various parts of it so that we can:
//
//   1. use the same conditions but make a ` findFirst()` call to get the latest
//      record
//   2. reconstruct the original query you wanted to call and cache it if isn't
//      already in the cache
//
// For example calling this function like so:
//
//   cacheLatest('posts', { model: db.user }, { findMany: { where: { isAdmin: true } } })
//
// results in two separate queries, first to determine the newest record in the
// result set:
//
//   db.user.findUnique({ where: { isAdmin: true }, orderBy: { updatedAt: 'desc' } } })
//
// The record that's returned is used to construct the cache key, in the form
// of `${prefix}-${id}-${updatedAt}` which in this case might look something
// like: `users-34-16003458234953` (`updatedAt` is converted to epoch)
//
// If the cache is not found with that key then at least one user in the result
// set has updated, so we need to run the full query and cache the result:
//
//   db.user.findMany({ where: { isAdmin: true } })
//
export const cacheLatest = async (
  key: string,
  options: CacheLatestOptions,
  query: LatestQuery
) => {
  let cacheKey = key
  const { model, ...rest } = options
  const queryFunction = Object.keys(query)[0]
  const conditions = query[queryFunction] as object

  // take the conditions from the query that's going to be cached, and only
  // return the latest record (based on `updatedAt`) from that set of records
  // and use it as the cache key
  try {
    const latest = await model.findFirst({
      ...conditions,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, updatedAt: true },
    })
    cacheKey = `${key}-${latest.id}-${latest.updatedAt.getTime()}`

    return cache(cacheKey, () => model[queryFunction](conditions), { ...rest })
  } catch (e) {
    console.error('Error in cacheLatest', e)
    return model[queryFunction](conditions)
  }
}