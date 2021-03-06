const _ = require('../util/lodash-wrap')
const store = require('./index')
const argsMatch = require('../args-match')
const callback = require('../matchers/callback')
const config = require('../config')
const log = require('../log')

module.exports = {
  add (testDouble, args, stubbedValues, config) {
    return store.for(testDouble).stubbings.push({
      callCount: 0,
      stubbedValues,
      args,
      config
    })
  },

  invoke (context, testDouble, actualArgs) {
    const stubbing = stubbingFor(testDouble, actualArgs)
    if (stubbing) {
      return executePlan(context, stubbing, actualArgs)
    }
  },

  for (testDouble) {
    return store.for(testDouble).stubbings
  }
}

var stubbingFor = (testDouble, actualArgs) =>
  _.findLast(store.for(testDouble).stubbings, stubbing =>
    isSatisfied(stubbing, actualArgs))

var executePlan = (context, stubbing, actualArgs) => {
  const value = stubbedValueFor(stubbing)
  stubbing.callCount += 1
  invokeCallbackFor(stubbing, actualArgs)
  switch (stubbing.config.plan) {
    case 'thenReturn': return value
    case 'thenDo': return value.apply(context, actualArgs)
    case 'thenThrow': throw value
    case 'thenResolve': return createPromise(stubbing, value, true)
    case 'thenReject': return createPromise(stubbing, value, false)
  }
}

var invokeCallbackFor = (stubbing, actualArgs) => {
  if (_.some(stubbing.args, callback.isCallback)) {
    _.each(stubbing.args, (expectedArg, i) => {
      if (callback.isCallback(expectedArg)) {
        callCallback(stubbing, actualArgs[i], callbackArgs(stubbing, expectedArg))
      }
    })
  }
}

var callbackArgs = (stubbing, expectedArg) => {
  if (expectedArg.args != null) {
    return expectedArg.args
  } else if (stubbing.config.plan === 'thenCallback') {
    return stubbing.stubbedValues
  } else {
    return []
  }
}

var callCallback = (stubbing, callback, args) => {
  if (stubbing.config.delay) {
    return _.delay(callback, stubbing.config.delay, ...args)
  } else if (stubbing.config.defer) {
    return _.defer(callback, ...args)
  } else {
    return callback(...args)
  }
}

var createPromise = (stubbing, value, willResolve) => {
  const Promise = config().promiseConstructor
  ensurePromise(Promise)
  return new Promise((resolve, reject) => {
    callCallback(stubbing, () =>
      willResolve ? resolve(value) : reject(value)
    , [value])
  })
}

var stubbedValueFor = (stubbing) =>
  stubbing.callCount < stubbing.stubbedValues.length
    ? stubbing.stubbedValues[stubbing.callCount]
    : _.last(stubbing.stubbedValues)

var isSatisfied = (stubbing, actualArgs) =>
  argsMatch(stubbing.args, actualArgs, stubbing.config) &&
    hasTimesRemaining(stubbing)

var hasTimesRemaining = (stubbing) =>
  stubbing.config.times == null
    ? true
    : stubbing.callCount < stubbing.config.times

var ensurePromise = (Promise) => {
  if (Promise == null) {
    return log.error('td.when', `\
no promise constructor is set (perhaps this runtime lacks a native Promise
function?), which means this stubbing can't return a promise to your
subject under test, resulting in this error. To resolve the issue, set
a promise constructor with \`td.config\`, like this:

  td.config({
    promiseConstructor: require('bluebird')
  })\
`)
  }
}
