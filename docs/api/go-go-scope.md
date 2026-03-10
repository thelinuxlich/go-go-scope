# go-go-scope API Reference

> Auto-generated documentation for go-go-scope

## Table of Contents

- [Functions](#Functions)
  - [fromArray](#fromarray)
  - [toArray](#toarray)
  - [first](#first)
  - [merge](#merge)
  - [zip](#zip)
  - [map](#map)
  - [filter](#filter)
  - [take](#take)
  - [skip](#skip)
  - [buffer](#buffer)
  - [tap](#tap)
  - [concat](#concat)
  - [delay](#delay)
  - [debounce](#debounce)
  - [throttle](#throttle)
  - [createCache](#createcache)
  - [onAbort](#onabort)
  - [abortPromise](#abortpromise)
  - [whenAborted](#whenaborted)
  - [createEventEmitter](#createeventemitter)
  - [scope](#scope)
  - [setupEnhancedGracefulShutdown](#setupenhancedgracefulshutdown)
  - [createShutdownCoordinator](#createshutdowncoordinator)
  - [setupGracefulShutdown](#setupgracefulshutdown)
  - [createIdempotencyProvider](#createidempotencyprovider)
  - [createLock](#createlock)
  - [generateTraceId](#generatetraceid)
  - [generateSpanId](#generatespanid)
  - [createCorrelatedLogger](#createcorrelatedlogger)
  - [isCorrelatedLogger](#iscorrelatedlogger)
  - [getCorrelationContext](#getcorrelationcontext)
  - [createLogger](#createlogger)
  - [createTaskLogger](#createtasklogger)
  - [parseMemoryLimit](#parsememorylimit)
  - [getMemoryUsage](#getmemoryusage)
  - [isMemoryMonitoringAvailable](#ismemorymonitoringavailable)
  - [parallel](#parallel)
  - [performanceMonitor](#performancemonitor)
  - [benchmarkInWorker](#benchmarkinworker)
  - [benchmark](#benchmark)
  - [hasPlugin](#hasplugin)
  - [registerPlugin](#registerplugin)
  - [poll](#poll)
  - [race](#race)
  - [debounce](#debounce)
  - [throttle](#throttle)
  - [exponentialBackoff](#exponentialbackoff)
  - [jitter](#jitter)
  - [linear](#linear)
  - [decorrelatedJitter](#decorrelatedjitter)
  - [extractTransferables](#extracttransferables)
  - [createSharedWorker](#createsharedworker)
  - [createTokenBucket](#createtokenbucket)
  - [getDefaultWorkerCount](#getdefaultworkercount)
  - [workerPool](#workerpool)
- [Classes](#Classes)
  - [Batch](#batch)
  - [BroadcastChannel](#broadcastchannel)
  - [InMemoryCache](#inmemorycache)
  - [Channel](#channel)
  - [InMemoryCheckpointProvider](#inmemorycheckpointprovider)
  - [CircuitBreaker](#circuitbreaker)
  - [UnknownError](#unknownerror)
  - [AbortError](#aborterror)
  - [ChannelFullError](#channelfullerror)
  - [ScopedEventEmitter](#scopedeventemitter)
  - [EnhancedGracefulShutdownController](#enhancedgracefulshutdowncontroller)
  - [ShutdownCoordinator](#shutdowncoordinator)
  - [ProcessLifecycle](#processlifecycle)
  - [GracefulShutdownController](#gracefulshutdowncontroller)
  - [InMemoryIdempotencyProvider](#inmemoryidempotencyprovider)
  - [LockGuard](#lockguard)
  - [Lock](#lock)
  - [CorrelatedLogger](#correlatedlogger)
  - [ConsoleLogger](#consolelogger)
  - [NoOpLogger](#nooplogger)
  - [MemoryMonitor](#memorymonitor)
  - [PerformanceMonitor](#performancemonitor)
  - [MemoryTracker](#memorytracker)
  - [PriorityChannel](#prioritychannel)
  - [ResourcePool](#resourcepool)
  - [AsyncDisposableResource](#asyncdisposableresource)
  - [Scope](#scope)
  - [Semaphore](#semaphore)
  - [SharedWorkerModule](#sharedworkermodule)
  - [Task](#task)
  - [TokenBucket](#tokenbucket)
  - [WorkerPool](#workerpool)
- [Interfaces](#Interfaces)
  - [AsyncIteratorFromOptions](#asynciteratorfromoptions)
  - [FromArrayOptions](#fromarrayoptions)
  - [BatchOptions](#batchoptions)
  - [EnhancedGracefulShutdownOptions](#enhancedgracefulshutdownoptions)
  - [GracefulShutdownOptions](#gracefulshutdownoptions)
  - [InMemoryIdempotencyProviderOptions](#inmemoryidempotencyprovideroptions)
  - [LockOptions](#lockoptions)
  - [LockAcquireOptions](#lockacquireoptions)
  - [CorrelationContext](#correlationcontext)
  - [MemoryUsage](#memoryusage)
  - [MemoryLimitConfig](#memorylimitconfig)
  - [ParallelOptions](#paralleloptions)
  - [PerformanceMetrics](#performancemetrics)
  - [PerformanceSnapshot](#performancesnapshot)
  - [PerformanceMonitorOptions](#performancemonitoroptions)
  - [BenchmarkOptions](#benchmarkoptions)
  - [BenchmarkResult](#benchmarkresult)
  - [LockProvider](#lockprovider)
  - [LockHandle](#lockhandle)
  - [CircuitBreakerStateProvider](#circuitbreakerstateprovider)
  - [CircuitBreakerPersistedState](#circuitbreakerpersistedstate)
  - [CacheProvider](#cacheprovider)
  - [CacheStats](#cachestats)
  - [IdempotencyProvider](#idempotencyprovider)
  - [Checkpoint](#checkpoint)
  - [CheckpointProvider](#checkpointprovider)
  - [PersistenceProviders](#persistenceproviders)
  - [PersistenceAdapterOptions](#persistenceadapteroptions)
  - [PersistenceAdapter](#persistenceadapter)
  - [ScopePlugin](#scopeplugin)
  - [PrioritizedItem](#prioritizeditem)
  - [PriorityChannelOptions](#prioritychanneloptions)
  - [HealthCheckResult](#healthcheckresult)
  - [ScopeOptions](#scopeoptions)
  - [SharedWorkerOptions](#sharedworkeroptions)
  - [TokenBucketOptions](#tokenbucketoptions)
  - [RetryStrategies](#retrystrategies)
  - [CheckpointContext](#checkpointcontext)
  - [ProgressContext](#progresscontext)
  - [TaskContext](#taskcontext)
  - [TaskOptionsBase](#taskoptionsbase)
  - [TaskOptionsWithErrorClass](#taskoptionswitherrorclass)
  - [TaskOptionsWithSystemErrorClass](#taskoptionswithsystemerrorclass)
  - [WorkerModuleSpec](#workermodulespec)
  - [ScopeHooks](#scopehooks)
  - [DebounceOptions](#debounceoptions)
  - [ThrottleOptions](#throttleoptions)
  - [CircuitBreakerOptions](#circuitbreakeroptions)
  - [RaceOptions](#raceoptions)
  - [PollOptions](#polloptions)
  - [PollController](#pollcontroller)
  - [SelectOptions](#selectoptions)
  - [Logger](#logger)
  - [ScopeLoggingOptions](#scopeloggingoptions)
  - [DisposableScope](#disposablescope)
  - [ResourcePoolOptions](#resourcepooloptions)
  - [ChannelOptions](#channeloptions)
  - [WorkerPoolOptions](#workerpooloptions)
  - [WorkerMessage](#workermessage)
  - [PooledWorker](#pooledworker)
  - [PendingTask](#pendingtask)
  - [PendingModuleTask](#pendingmoduletask)
- [Types](#Types)
  - [EventHandler](#eventhandler)
  - [CircuitBreakerEvent](#circuitbreakerevent)
  - [EventHandler](#eventhandler)
  - [EventMap](#eventmap)
  - [ShutdownStrategy](#shutdownstrategy)
  - [ShutdownState](#shutdownstate)
  - [WithPlugins](#withplugins)
  - [PriorityComparator](#prioritycomparator)
  - [Success](#success)
  - [Failure](#failure)
  - [Result](#result)
  - [Transferable](#transferable)
  - [ErrorConstructor](#errorconstructor)
  - [RetryDelayFn](#retrydelayfn)
  - [TaskOptions](#taskoptions)
  - [CircuitBreakerState](#circuitbreakerstate)
  - [CircuitState](#circuitstate)
  - [FactoryResult](#factoryresult)
  - [ParallelResults](#parallelresults)
  - [BackpressureStrategy](#backpressurestrategy)
- [Methods](#Methods)
  - [Batch.add](#batch-add)
  - [Batch.addMany](#batch-addmany)
  - [Batch.flush](#batch-flush)
  - [Batch.stop](#batch-stop)
  - [BroadcastChannel.subscribe](#broadcastchannel-subscribe)
  - [BroadcastChannel.send](#broadcastchannel-send)
  - [BroadcastChannel.close](#broadcastchannel-close)
  - [InMemoryCache.get](#inmemorycache-get)
  - [InMemoryCache.set](#inmemorycache-set)
  - [InMemoryCache.delete](#inmemorycache-delete)
  - [InMemoryCache.has](#inmemorycache-has)
  - [InMemoryCache.clear](#inmemorycache-clear)
  - [InMemoryCache.keys](#inmemorycache-keys)
  - [InMemoryCache.stats](#inmemorycache-stats)
  - [InMemoryCache.prune](#inmemorycache-prune)
  - [InMemoryCache.evictLRU](#inmemorycache-evictlru)
  - [Channel.cleanupSampleBuffer](#channel-cleanupsamplebuffer)
  - [Channel.scheduleNotifications](#channel-schedulenotifications)
  - [Channel.processNotifications](#channel-processnotifications)
  - [Channel.dequeueInternal](#channel-dequeueinternal)
  - [Channel.send](#channel-send)
  - [Channel.receive](#channel-receive)
  - [Channel.close](#channel-close)
  - [Channel.drainQueues](#channel-drainqueues)
  - [Channel.map](#channel-map)
  - [Channel.filter](#channel-filter)
  - [Channel.reduce](#channel-reduce)
  - [Channel.take](#channel-take)
  - [InMemoryCheckpointProvider.save](#inmemorycheckpointprovider-save)
  - [InMemoryCheckpointProvider.loadLatest](#inmemorycheckpointprovider-loadlatest)
  - [InMemoryCheckpointProvider.load](#inmemorycheckpointprovider-load)
  - [InMemoryCheckpointProvider.list](#inmemorycheckpointprovider-list)
  - [InMemoryCheckpointProvider.cleanup](#inmemorycheckpointprovider-cleanup)
  - [InMemoryCheckpointProvider.deleteAll](#inmemorycheckpointprovider-deleteall)
  - [CircuitBreaker.getAdaptiveThreshold](#circuitbreaker-getadaptivethreshold)
  - [CircuitBreaker.getFailureCount](#circuitbreaker-getfailurecount)
  - [CircuitBreaker.execute](#circuitbreaker-execute)
  - [CircuitBreaker.reset](#circuitbreaker-reset)
  - [CircuitBreaker.on](#circuitbreaker-on)
  - [CircuitBreaker.off](#circuitbreaker-off)
  - [CircuitBreaker.once](#circuitbreaker-once)
  - [CircuitBreaker.emit](#circuitbreaker-emit)
  - [CircuitBreaker.onSuccess](#circuitbreaker-onsuccess)
  - [CircuitBreaker.onFailure](#circuitbreaker-onfailure)
  - [CircuitBreaker.transitionToHalfOpen](#circuitbreaker-transitiontohalfopen)
  - [ScopedEventEmitter.on](#scopedeventemitter-on)
  - [ScopedEventEmitter.once](#scopedeventemitter-once)
  - [ScopedEventEmitter.off](#scopedeventemitter-off)
  - [ScopedEventEmitter.emit](#scopedeventemitter-emit)
  - [ScopedEventEmitter.emitAsync](#scopedeventemitter-emitasync)
  - [ScopedEventEmitter.listenerCount](#scopedeventemitter-listenercount)
  - [ScopedEventEmitter.hasListeners](#scopedeventemitter-haslisteners)
  - [ScopedEventEmitter.eventNames](#scopedeventemitter-eventnames)
  - [ScopedEventEmitter.removeAllListeners](#scopedeventemitter-removealllisteners)
  - [ScopedEventEmitter.dispose](#scopedeventemitter-dispose)
  - [EnhancedGracefulShutdownController.trackTask](#enhancedgracefulshutdowncontroller-tracktask)
  - [EnhancedGracefulShutdownController.onShutdownHook](#enhancedgracefulshutdowncontroller-onshutdownhook)
  - [EnhancedGracefulShutdownController.shutdown](#enhancedgracefulshutdowncontroller-shutdown)
  - [EnhancedGracefulShutdownController.immediateShutdown](#enhancedgracefulshutdowncontroller-immediateshutdown)
  - [EnhancedGracefulShutdownController.drainShutdown](#enhancedgracefulshutdowncontroller-drainshutdown)
  - [EnhancedGracefulShutdownController.timeoutShutdown](#enhancedgracefulshutdowncontroller-timeoutshutdown)
  - [EnhancedGracefulShutdownController.hybridShutdown](#enhancedgracefulshutdowncontroller-hybridshutdown)
  - [EnhancedGracefulShutdownController.setupTaskTracking](#enhancedgracefulshutdowncontroller-setuptasktracking)
  - [ShutdownCoordinator.register](#shutdowncoordinator-register)
  - [ShutdownCoordinator.addDependency](#shutdowncoordinator-adddependency)
  - [ShutdownCoordinator.shutdownAll](#shutdowncoordinator-shutdownall)
  - [ShutdownCoordinator.calculateShutdownOrder](#shutdowncoordinator-calculateshutdownorder)
  - [ShutdownCoordinator.getStatus](#shutdowncoordinator-getstatus)
  - [ProcessLifecycle.init](#processlifecycle-init)
  - [ProcessLifecycle.initWithCoordinator](#processlifecycle-initwithcoordinator)
  - [ProcessLifecycle.getController](#processlifecycle-getcontroller)
  - [ProcessLifecycle.getCoordinator](#processlifecycle-getcoordinator)
  - [GracefulShutdownController.shutdown](#gracefulshutdowncontroller-shutdown)
  - [GracefulShutdownController.cleanup](#gracefulshutdowncontroller-cleanup)
  - [GracefulShutdownController.setupSignalHandlers](#gracefulshutdowncontroller-setupsignalhandlers)
  - [GracefulShutdownController.setupScopeIntegration](#gracefulshutdowncontroller-setupscopeintegration)
  - [InMemoryIdempotencyProvider.get](#inmemoryidempotencyprovider-get)
  - [InMemoryIdempotencyProvider.set](#inmemoryidempotencyprovider-set)
  - [InMemoryIdempotencyProvider.delete](#inmemoryidempotencyprovider-delete)
  - [InMemoryIdempotencyProvider.clear](#inmemoryidempotencyprovider-clear)
  - [InMemoryIdempotencyProvider.cleanup](#inmemoryidempotencyprovider-cleanup)
  - [LockGuard.release](#lockguard-release)
  - [Lock.acquire](#lock-acquire)
  - [Lock.read](#lock-read)
  - [Lock.write](#lock-write)
  - [Lock.tryAcquire](#lock-tryacquire)
  - [Lock.tryRead](#lock-tryread)
  - [Lock.tryWrite](#lock-trywrite)
  - [Lock.acquireInMemoryExclusive](#lock-acquireinmemoryexclusive)
  - [Lock.acquireInMemoryRead](#lock-acquireinmemoryread)
  - [Lock.acquireInMemoryWrite](#lock-acquireinmemorywrite)
  - [Lock.acquireDistributedExclusive](#lock-acquiredistributedexclusive)
  - [Lock.tryAcquireDistributedExclusive](#lock-tryacquiredistributedexclusive)
  - [Lock.acquireDistributedRead](#lock-acquiredistributedread)
  - [Lock.tryAcquireDistributedRead](#lock-tryacquiredistributedread)
  - [Lock.acquireDistributedWrite](#lock-acquiredistributedwrite)
  - [Lock.tryAcquireDistributedWrite](#lock-tryacquiredistributedwrite)
  - [Lock.processQueue](#lock-processqueue)
  - [Lock.releaseExclusive](#lock-releaseexclusive)
  - [Lock.releaseRead](#lock-releaseread)
  - [Lock.releaseWrite](#lock-releasewrite)
  - [Lock.scheduleDistributedExtend](#lock-scheduledistributedextend)
  - [Lock.clearDistributedExtend](#lock-cleardistributedextend)
  - [Lock.removeRequest](#lock-removerequest)
  - [Lock.clearTimeout](#lock-cleartimeout)
  - [Lock.sleep](#lock-sleep)
  - [CorrelatedLogger.formatMessage](#correlatedlogger-formatmessage)
  - [CorrelatedLogger.formatStructured](#correlatedlogger-formatstructured)
  - [CorrelatedLogger.debug](#correlatedlogger-debug)
  - [CorrelatedLogger.info](#correlatedlogger-info)
  - [CorrelatedLogger.warn](#correlatedlogger-warn)
  - [CorrelatedLogger.error](#correlatedlogger-error)
  - [CorrelatedLogger.getCorrelationContext](#correlatedlogger-getcorrelationcontext)
  - [ConsoleLogger.debug](#consolelogger-debug)
  - [ConsoleLogger.info](#consolelogger-info)
  - [ConsoleLogger.warn](#consolelogger-warn)
  - [ConsoleLogger.error](#consolelogger-error)
  - [NoOpLogger.debug](#nooplogger-debug)
  - [NoOpLogger.info](#nooplogger-info)
  - [NoOpLogger.warn](#nooplogger-warn)
  - [NoOpLogger.error](#nooplogger-error)
  - [MemoryMonitor.start](#memorymonitor-start)
  - [MemoryMonitor.checkMemory](#memorymonitor-checkmemory)
  - [MemoryMonitor.getUsage](#memorymonitor-getusage)
  - [MemoryMonitor.getLimit](#memorymonitor-getlimit)
  - [MemoryMonitor.setLimit](#memorymonitor-setlimit)
  - [PerformanceMonitor.start](#performancemonitor-start)
  - [PerformanceMonitor.stop](#performancemonitor-stop)
  - [PerformanceMonitor.takeSnapshot](#performancemonitor-takesnapshot)
  - [PerformanceMonitor.getMetrics](#performancemonitor-getmetrics)
  - [PerformanceMonitor.getSnapshots](#performancemonitor-getsnapshots)
  - [PerformanceMonitor.getTrends](#performancemonitor-gettrends)
  - [MemoryTracker.snapshot](#memorytracker-snapshot)
  - [MemoryTracker.checkForLeaks](#memorytracker-checkforleaks)
  - [MemoryTracker.getGrowthRate](#memorytracker-getgrowthrate)
  - [MemoryTracker.getSnapshots](#memorytracker-getsnapshots)
  - [PriorityChannel.send](#prioritychannel-send)
  - [PriorityChannel.trySend](#prioritychannel-trysend)
  - [PriorityChannel.sendOrDrop](#prioritychannel-sendordrop)
  - [PriorityChannel.receive](#prioritychannel-receive)
  - [PriorityChannel.tryReceive](#prioritychannel-tryreceive)
  - [PriorityChannel.peek](#prioritychannel-peek)
  - [PriorityChannel.close](#prioritychannel-close)
  - [PriorityChannel.notifyReceivers](#prioritychannel-notifyreceivers)
  - [PriorityChannel.processWaitingSenders](#prioritychannel-processwaitingsenders)
  - [PriorityChannel.drainQueues](#prioritychannel-drainqueues)
  - [ResourcePool.initialize](#resourcepool-initialize)
  - [ResourcePool.acquire](#resourcepool-acquire)
  - [ResourcePool.release](#resourcepool-release)
  - [ResourcePool.execute](#resourcepool-execute)
  - [ResourcePool.checkHealth](#resourcepool-checkhealth)
  - [ResourcePool.startHealthChecks](#resourcepool-starthealthchecks)
  - [ResourcePool.removeResource](#resourcepool-removeresource)
  - [Scope.task](#scope-task)
  - [Scope.resumeTask](#scope-resumetask)
  - [Scope.parallel](#scope-parallel)
  - [Scope.race](#scope-race)
  - [Scope.wrapError](#scope-wraperror)
  - [Scope.setContext](#scope-setcontext)
  - [Scope.getContext](#scope-getcontext)
  - [Scope.hasContext](#scope-hascontext)
  - [Scope.removeContext](#scope-removecontext)
  - [Scope.getAllContext](#scope-getallcontext)
  - [Scope.eventEmitter](#scope-eventemitter)
  - [Scope.acquireLock](#scope-acquirelock)
  - [Scope.poll](#scope-poll)
  - [Scope.debounce](#scope-debounce)
  - [Scope.throttle](#scope-throttle)
  - [Scope.delay](#scope-delay)
  - [Scope.batch](#scope-batch)
  - [Scope.every](#scope-every)
  - [Scope.any](#scope-any)
  - [Scope.metrics](#scope-metrics)
  - [Scope.memoryUsage](#scope-memoryusage)
  - [Scope.setMemoryLimit](#scope-setmemorylimit)
  - [Scope.onBeforeTask](#scope-onbeforetask)
  - [Scope.onAfterTask](#scope-onaftertask)
  - [Scope.createChild](#scope-createchild)
  - [Scope.debugTree](#scope-debugtree)
  - [Semaphore.acquire](#semaphore-acquire)
  - [Semaphore.execute](#semaphore-execute)
  - [Semaphore.tryAcquire](#semaphore-tryacquire)
  - [Semaphore.tryAcquireWithFn](#semaphore-tryacquirewithfn)
  - [Semaphore.acquireWithTimeout](#semaphore-acquirewithtimeout)
  - [Semaphore.acquireWithTimeoutAndFn](#semaphore-acquirewithtimeoutandfn)
  - [Semaphore.bulkAcquire](#semaphore-bulkacquire)
  - [Semaphore.tryBulkAcquire](#semaphore-trybulkacquire)
  - [Semaphore.wait](#semaphore-wait)
  - [Semaphore.release](#semaphore-release)
  - [Semaphore.waitForMultiple](#semaphore-waitformultiple)
  - [Semaphore.releaseMultiple](#semaphore-releasemultiple)
  - [Semaphore.drainQueue](#semaphore-drainqueue)
  - [SharedWorkerModule.initialize](#sharedworkermodule-initialize)
  - [SharedWorkerModule.export](#sharedworkermodule-export)
  - [SharedWorkerModule.getAvailableExports](#sharedworkermodule-getavailableexports)
  - [SharedWorkerModule.hasExport](#sharedworkermodule-hasexport)
  - [Task.setupAbortController](#task-setupabortcontroller)
  - [Task.start](#task-start)
  - [Task.then](#task-then)
  - [Task.catch](#task-catch)
  - [Task.finally](#task-finally)
  - [TokenBucket.getTokens](#tokenbucket-gettokens)
  - [TokenBucket.tryConsume](#tokenbucket-tryconsume)
  - [TokenBucket.acquire](#tokenbucket-acquire)
  - [TokenBucket.acquireWithTimeout](#tokenbucket-acquirewithtimeout)
  - [TokenBucket.reset](#tokenbucket-reset)
  - [TokenBucket.getState](#tokenbucket-getstate)
  - [TokenBucket.refill](#tokenbucket-refill)
  - [TokenBucket.tryConsumeLocal](#tokenbucket-tryconsumelocal)
  - [TokenBucket.waitForTokens](#tokenbucket-waitfortokens)
  - [TokenBucket.waitForTokensWithTimeout](#tokenbucket-waitfortokenswithtimeout)
  - [TokenBucket.getDistributedTokens](#tokenbucket-getdistributedtokens)
  - [TokenBucket.tryConsumeDistributed](#tokenbucket-tryconsumedistributed)
  - [TokenBucket.resetDistributed](#tokenbucket-resetdistributed)
  - [WorkerPool.execute](#workerpool-execute)
  - [WorkerPool.executeModule](#workerpool-executemodule)
  - [WorkerPool.validateModule](#workerpool-validatemodule)
  - [WorkerPool.executeBatch](#workerpool-executebatch)
  - [WorkerPool.stats](#workerpool-stats)

## Functions

### fromArray

```typescript
function fromArray<T>(array: T[], options: FromArrayOptions = {}): AsyncIterable<T>
```

Create an async iterator from an array with async delay between items

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `array` | `T[]` |  |
| `options` (optional) | `FromArrayOptions` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:26](packages/go-go-scope/src/async-iterable.ts#L26)*

---

### toArray

```typescript
function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]>
```

Convert an async iterable to an array

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |

**Returns:** `Promise<T[]>`

*Source: [async-iterable.ts:65](packages/go-go-scope/src/async-iterable.ts#L65)*

---

### first

```typescript
function first<T>(iterable: AsyncIterable<T>): Promise<T | undefined>
```

Convert an async iterable to a promise that resolves with the first value

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |

**Returns:** `Promise<T | undefined>`

*Source: [async-iterable.ts:76](packages/go-go-scope/src/async-iterable.ts#L76)*

---

### merge

```typescript
function merge<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T>
```

Merge multiple async iterables into one Values are yielded as they arrive (order not guaranteed)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterables` | `AsyncIterable<T>[]` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:89](packages/go-go-scope/src/async-iterable.ts#L89)*

---

### zip

```typescript
function zip<T extends unknown[]>(...iterables: { [K in keyof T]: AsyncIterable<T[K]> }): AsyncIterable<T>
```

Zip multiple async iterables together Yields arrays of [value1, value2, ...] Stops when any iterable is exhausted

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterables` | `{ [K in keyof T]: AsyncIterable<T[K]> }` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:124](packages/go-go-scope/src/async-iterable.ts#L124)*

---

### map

```typescript
function map<T, R>(iterable: AsyncIterable<T>, fn: (value: T, index: number) => R | Promise<R>): AsyncIterable<R>
```

Transform an async iterable with a mapping function

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `fn` | `(value: T, index: number) => R | Promise<R>` |  |

**Returns:** `AsyncIterable<R>`

*Source: [async-iterable.ts:151](packages/go-go-scope/src/async-iterable.ts#L151)*

---

### filter

```typescript
function filter<T>(iterable: AsyncIterable<T>, predicate: (value: T, index: number) => boolean | Promise<boolean>): AsyncIterable<T>
```

Filter an async iterable

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `predicate` | `(value: T, index: number) => boolean | Promise<boolean>` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:168](packages/go-go-scope/src/async-iterable.ts#L168)*

---

### take

```typescript
function take<T>(iterable: AsyncIterable<T>, n: number): AsyncIterable<T>
```

Take first n items from an async iterable

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `n` | `number` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:187](packages/go-go-scope/src/async-iterable.ts#L187)*

---

### skip

```typescript
function skip<T>(iterable: AsyncIterable<T>, n: number): AsyncIterable<T>
```

Skip first n items from an async iterable

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `n` | `number` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:206](packages/go-go-scope/src/async-iterable.ts#L206)*

---

### buffer

```typescript
function buffer<T>(iterable: AsyncIterable<T>, size: number): AsyncIterable<T[]>
```

Buffer items from an async iterable into chunks

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `size` | `number` |  |

**Returns:** `AsyncIterable<T[]>`

*Source: [async-iterable.ts:226](packages/go-go-scope/src/async-iterable.ts#L226)*

---

### tap

```typescript
function tap<T>(iterable: AsyncIterable<T>, fn: (value: T, index: number) => void | Promise<void>): AsyncIterable<T>
```

Add a side effect to an async iterable without modifying values

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `fn` | `(value: T, index: number) => void | Promise<void>` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:249](packages/go-go-scope/src/async-iterable.ts#L249)*

---

### concat

```typescript
function concat<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T>
```

Concatenate multiple async iterables

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterables` | `AsyncIterable<T>[]` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:267](packages/go-go-scope/src/async-iterable.ts#L267)*

---

### delay

```typescript
function delay(ms: number, options: AsyncIteratorFromOptions = {}): AsyncIterable<void>
```

Create an async iterable that completes after a delay

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` |  |
| `options` (optional) | `AsyncIteratorFromOptions` |  |

**Returns:** `AsyncIterable<void>`

*Source: [async-iterable.ts:280](packages/go-go-scope/src/async-iterable.ts#L280)*

---

### debounce

```typescript
function debounce<T>(iterable: AsyncIterable<T>, ms: number): AsyncIterable<T>
```

Debounce an async iterable

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `ms` | `number` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:310](packages/go-go-scope/src/async-iterable.ts#L310)*

---

### throttle

```typescript
function throttle<T>(iterable: AsyncIterable<T>, ms: number): AsyncIterable<T>
```

Throttle an async iterable

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `iterable` | `AsyncIterable<T>` |  |
| `ms` | `number` |  |

**Returns:** `AsyncIterable<T>`

*Source: [async-iterable.ts:368](packages/go-go-scope/src/async-iterable.ts#L368)*

---

### createCache

```typescript
function createCache(options?: { maxSize?: number }): InMemoryCache
```

Creates an in-memory cache provider with the specified options. This is a convenience factory function that creates an {@link InMemoryCache} instance. For distributed caching across multiple processes, use a persistence provider from @go-go-scope/persistence-* packages.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `{ maxSize?: number }` | - Cache configuration options |

**Returns:** `InMemoryCache`

A new InMemoryCache instance

**Examples:**

```typescript
import { scope, createCache } from "go-go-scope";

// Create cache
const cache = createCache({ maxSize: 500 });

// Use with explicit resource management
using c = createCache();

await c.set("key", "value", 60000);
const value = await c.get("key");
```

**@go-go-scope:** /persistence-* packages.

**@param:** - Maximum number of entries (default: 1000)

**@returns:** A new InMemoryCache instance

*Source: [cache.ts:427](packages/go-go-scope/src/cache.ts#L427)*

---

### onAbort

```typescript
function onAbort(signal: AbortSignal, callback: (reason: unknown) => void): Disposable
```

Registers a callback to be invoked when the signal is aborted. Returns a disposable that can be used to unregister the callback. The callback is automatically unregistered after it's invoked (once). #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `AbortSignal` | - The AbortSignal to listen to |
| `callback` | `(reason: unknown) => void` | - Function to call when aborted |

**Returns:** `Disposable`

A Disposable that can be used to unregister

**Examples:**

```typescript
await s.task(({ signal }) => {
  // Register cleanup
  const disposable = onAbort(signal, () => {
    console.log('Task was cancelled')
  })

  try {
    return await longRunningOperation()
  } finally {
    // Unregister if not aborted (optional, auto-cleaned on abort)
    disposable[Symbol.dispose]()
  }
})
```

**@param:** - Function to call when aborted

**@returns:** A Disposable that can be used to unregister

*Source: [cancellation.ts:40](packages/go-go-scope/src/cancellation.ts#L40)*

---

### abortPromise

```typescript
function abortPromise(signal: AbortSignal): Promise<never>
```

Creates a promise that rejects when the signal is aborted. Useful for racing operations against cancellation. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `AbortSignal` | - The AbortSignal to watch |

**Returns:** `Promise<never>`

A promise that rejects with the abort reason

**Examples:**

```typescript
await s.task(async ({ signal }) => {
  // Race between operation and cancellation
  const result = await Promise.race([
    fetchData(),
    abortPromise(signal).then(() => { throw new Error('Cancelled') })
  ])
})
```

**@param:** - The AbortSignal to watch

**@returns:** A promise that rejects with the abort reason

*Source: [cancellation.ts:100](packages/go-go-scope/src/cancellation.ts#L100)*

---

### whenAborted

```typescript
function whenAborted(signal: AbortSignal): Promise<unknown>
```

Waits for a signal to be aborted. Returns immediately if already aborted. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `AbortSignal` | - The AbortSignal to wait for |

**Returns:** `Promise<unknown>`

Promise that resolves when aborted

**Examples:**

```typescript
await s.task(async ({ signal }) => {
  // Wait for cancellation
  await whenAborted(signal)
  console.log('Scope was cancelled')
})
```

**@param:** - The AbortSignal to wait for

**@returns:** Promise that resolves when aborted

*Source: [cancellation.ts:134](packages/go-go-scope/src/cancellation.ts#L134)*

---

### createEventEmitter

```typescript
function createEventEmitter<Events extends EventMap>(scope: Scope<Record<string, unknown>>): ScopedEventEmitter<Events>
```

Create a scoped EventEmitter.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<Record<string, unknown>>` | - Parent scope for automatic cleanup |

**Returns:** `ScopedEventEmitter<Events>`

ScopedEventEmitter instance

**Examples:**

```typescript
import { scope, createEventEmitter } from "go-go-scope";

await using s = scope();
const emitter = createEventEmitter<{
  message: (text: string) => void;
}>(s);

emitter.on("message", (text) => console.log(text));
emitter.emit("message", "Hello!");
```

**@param:** - Parent scope for automatic cleanup

**@returns:** ScopedEventEmitter instance

*Source: [event-emitter.ts:280](packages/go-go-scope/src/event-emitter.ts#L280)*

---

### scope

```typescript
function scope<TServices extends Record<string, unknown> = Record<string, unknown>>(options?: ScopeOptions<TServices>): Scope<TServices>
```

Creates a new Scope for structured concurrency. A Scope is a container for concurrent tasks that ensures proper cleanup and cancellation propagation. When a scope is disposed, all tasks within it are automatically cancelled. This enables safe, predictable concurrent programming using the `using`/`await using` syntax. Scopes support: - Automatic cancellation propagation to child tasks - Timeout handling with automatic cleanup - Parent-child scope relationships - Concurrency limiting - Circuit breaker patterns - OpenTelemetry tracing integration - Lifecycle hooks for monitoring - Service dependency injection parent signal, concurrency limits, circuit breaker, tracing, and more #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `ScopeOptions<TServices>` | - Optional configuration for the scope including timeout,
parent signal, concurrency limits, circuit breaker, tracing, and more |

**Returns:** `Scope<TServices>`

A new Scope instance ready for task execution

**Examples:**

```typescript
import { scope } from 'go-go-scope';

// Create a basic scope
await using s = scope();

// Spawn a task within the scope
const [err, result] = await s.task(async ({ signal }) => {
  const response = await fetch('/api/data', { signal });
  return response.json();
});

if (err) {
  console.error('Task failed:', err);
} else {
  console.log('Result:', result);
}
// Scope automatically disposed, cancelling any pending tasks
```

```typescript
// Create a scope with a timeout
await using s = scope({ timeout: 5000 });

const [err, data] = await s.task(async ({ signal }) => {
  return await fetchSlowData({ signal });
});

if (err) {
  console.log('Task timed out or failed:', err.message);
}
```

```typescript
// Nested scopes with parent-child cancellation
await using parent = scope({ name: 'parent' });

{
  await using child = parent.createChild({ name: 'child' });

  const task = child.task(async ({ signal }) => {
    return await longRunningOperation({ signal });
  });

  // When child scope exits (due to block scope), task is cancelled
}

// Parent scope continues unaffected
```

```typescript
// Scope with OpenTelemetry tracing
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-app');

await using s = scope({ tracer });

// Each task creates a span, scope disposal creates a summary span
const [err, result] = await s.task(async () => {
  return await processData();
}, { id: 'data-processing' });
```

```typescript
// Scope with concurrency limiting
await using s = scope({ concurrency: 3 });

// Only 3 tasks will run concurrently, others are queued
const tasks = urls.map(url =>
  s.task(async ({ signal }) => {
    return await fetch(url, { signal });
  })
);

const results = await Promise.all(tasks);
```

```typescript
// Scope with circuit breaker for fault tolerance
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000,
    onStateChange: (from, to) => console.log(`Circuit: ${from} -> ${to}`)
  }
});

// Tasks automatically protected by circuit breaker
const [err, result] = await s.task(() => callUnreliableService());
```

**@typeParam:** TServices - Type of services injected into the scope (default: empty record)

**@param:** - Callback when memory pressure is detected

**@returns:** A new Scope instance ready for task execution

**@see:** {@link ScopeOptions} - Available scope configuration options

*Source: [factory.ts:157](packages/go-go-scope/src/factory.ts#L157)*

---

### setupEnhancedGracefulShutdown

```typescript
function setupEnhancedGracefulShutdown(scope: Scope<Record<string, unknown>>, options: EnhancedGracefulShutdownOptions = {}): EnhancedGracefulShutdownController
```

Setup enhanced graceful shutdown

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<Record<string, unknown>>` |  |
| `options` (optional) | `EnhancedGracefulShutdownOptions` |  |

**Returns:** `EnhancedGracefulShutdownController`

*Source: [graceful-shutdown-enhanced.ts:346](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L346)*

---

### createShutdownCoordinator

```typescript
function createShutdownCoordinator(): ShutdownCoordinator
```

Create a shutdown coordinator

**Returns:** `ShutdownCoordinator`

*Source: [graceful-shutdown-enhanced.ts:478](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L478)*

---

### setupGracefulShutdown

```typescript
function setupGracefulShutdown(scope: Scope<Record<string, unknown>>, options?: GracefulShutdownOptions): GracefulShutdownController
```

Setup graceful shutdown handling for a scope. Factory function that creates a {@link GracefulShutdownController} for the given scope. The controller will automatically handle shutdown signals and coordinate cleanup with the scope lifecycle.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<Record<string, unknown>>` | - The scope to coordinate shutdown with |
| `options` (optional) | `GracefulShutdownOptions` | - Configuration options for shutdown behavior |

**Returns:** `GracefulShutdownController`

The shutdown controller

**Examples:**

```typescript
import { scope, setupGracefulShutdown } from "go-go-scope";

await using s = scope();

// Setup with default options
const shutdown = setupGracefulShutdown(s);

// Setup with custom options
const shutdown = setupGracefulShutdown(s, {
  signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],
  timeout: 60000,
  onShutdown: async (signal) => {
    console.log(`Shutting down due to ${signal}...`);
    await notifyMonitoringSystem();
  },
  onComplete: async () => {
    console.log('Shutdown complete');
    await flushLogs();
  },
  exit: true,
  successExitCode: 0,
  timeoutExitCode: 1
});

// Tasks can check for shutdown
s.task(async ({ signal }) => {
  while (!signal.aborted) {
    await processWork();
  }
});

// Or use the controller
s.task(async () => {
  while (!shutdown.isShutdownRequested) {
    await processWork();
  }
});

// Manual shutdown
app.post('/shutdown', async (req, res) => {
  res.json({ status: 'shutting down' });
  await shutdown.shutdown('SIGTERM');
});

// Cleanup signal handlers if needed
process.on('message', (msg) => {
  if (msg === 'disconnect') {
    shutdown.cleanup();
  }
});
```

**@param:** - Exit code on timeout (default: 1)

**@returns:** The shutdown controller

**@see:** {@link Scope.setupGracefulShutdown} Factory method on scope

*Source: [graceful-shutdown.ts:486](packages/go-go-scope/src/graceful-shutdown.ts#L486)*

---

### createIdempotencyProvider

```typescript
function createIdempotencyProvider(options?: InMemoryIdempotencyProviderOptions): InMemoryIdempotencyProvider
```

Creates an in-memory idempotency provider. This is a convenience factory function that creates an {@link InMemoryIdempotencyProvider} instance. For production use with persistence across restarts, use a distributed provider from @go-go-scope/persistence-* packages.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `InMemoryIdempotencyProviderOptions` | - Provider configuration options |

**Returns:** `InMemoryIdempotencyProvider`

A new InMemoryIdempotencyProvider instance

**Examples:**

```typescript
import { scope, createIdempotencyProvider } from "go-go-scope";

// Create provider
const provider = createIdempotencyProvider({ maxSize: 1000 });

// Use with scope
await using s = scope({
persistence: { idempotency: provider }
});

// Idempotent task execution
const [err, result] = await s.task(
async () => await processPayment(orderId),
{
idempotency: {
key: `payment:${orderId}`,
ttl: 86400000 // 24 hours
}
}
);

// Safe to retry - returns cached result on subsequent calls
const [err2, result2] = await s.task(
async () => await processPayment(orderId),
{
idempotency: {
key: `payment:${orderId}`,
ttl: 86400000
}
}
);
// result === result2, processPayment only executed once
```

**@go-go-scope:** /persistence-* packages.

**@param:** - Maximum number of entries to store

**@returns:** A new InMemoryIdempotencyProvider instance

*Source: [idempotency.ts:360](packages/go-go-scope/src/idempotency.ts#L360)*

---

### createLock

```typescript
function createLock(signal?: AbortSignal, options?: LockOptions): Lock
```

Creates a new {@link Lock} instance. This is a convenience factory function. See {@link Lock} for detailed usage.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` (optional) | `AbortSignal` | - AbortSignal for cancellation (optional) |
| `options` (optional) | `LockOptions` | - Lock configuration options |

**Returns:** `Lock`

A new Lock instance

**Examples:**

```typescript
import { createLock } from "go-go-scope";
import { RedisAdapter } from "@go-go-scope/persistence-redis";

// Exclusive lock
const mutex = createLock(s.signal);
await using guard = await mutex.acquire();

// Read-write lock
const rwlock = createLock(s.signal, { allowMultipleReaders: true });
await using readGuard = await rwlock.read();
await using writeGuard = await rwlock.write();

// Distributed lock with Redis
const distLock = createLock(s.signal, {
  provider: new RedisAdapter(redis),
  key: "my-resource",
  ttl: 30000,
});
await using guard = await distLock.acquire();
```

**@param:** - Name for debugging purposes (default: random string)

**@returns:** A new Lock instance

*Source: [lock.ts:1299](packages/go-go-scope/src/lock.ts#L1299)*

---

### generateTraceId

```typescript
function generateTraceId(): string
```

Generate a random trace ID (16 bytes hex). Trace IDs are used to correlate all operations within a single request or workflow across multiple scopes and services. Format: 32-character hexadecimal string (16 bytes) Example: "4f6a95367f5f4c6e9f3e2d8b1a0c5f7e"

**Returns:** `string`

A 32-character hex string representing the trace ID

**Examples:**

```typescript
import { generateTraceId } from "go-go-scope";

const traceId = generateTraceId();
console.log(traceId); // "a1b2c3d4e5f6..." (32 chars)

// Use for manual correlation
const requestId = generateTraceId();
logger.info("Request started", { traceId: requestId });
```

**@returns:** A 32-character hex string representing the trace ID

*Source: [log-correlation.ts:75](packages/go-go-scope/src/log-correlation.ts#L75)*

---

### generateSpanId

```typescript
function generateSpanId(): string
```

Generate a random span ID (8 bytes hex). Span IDs identify a single operation (scope) within a trace. Each scope in a trace hierarchy has its own unique span ID. Format: 16-character hexadecimal string (8 bytes) Example: "7f5f4c6e9f3e2d8b"

**Returns:** `string`

A 16-character hex string representing the span ID

**Examples:**

```typescript
import { generateSpanId } from "go-go-scope";

const spanId = generateSpanId();
console.log(spanId); // "a1b2c3d4e5f6..." (16 chars)

// Parent-child relationship in logs
const parentSpanId = generateSpanId();
const childSpanId = generateSpanId();

logger.info("Parent operation", { spanId: parentSpanId });
logger.info("Child operation", {
  spanId: childSpanId,
  parentSpanId: parentSpanId
});
```

**@returns:** A 16-character hex string representing the span ID

*Source: [log-correlation.ts:111](packages/go-go-scope/src/log-correlation.ts#L111)*

---

### createCorrelatedLogger

```typescript
function createCorrelatedLogger(delegate: Logger, correlation: CorrelationContext): CorrelatedLogger
```

Create a correlated logger wrapper. Factory function to create a CorrelatedLogger instance.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `delegate` | `Logger` | - The underlying logger to wrap |
| `correlation` | `CorrelationContext` | - The correlation context to include in all logs |

**Returns:** `CorrelatedLogger`

A new CorrelatedLogger instance

**Examples:**

```typescript
import { createCorrelatedLogger, ConsoleLogger } from "go-go-scope";

const delegate = new ConsoleLogger("payment-service", "info");

const logger = createCorrelatedLogger(delegate, {
  traceId: "pay_abc123",
  spanId: "span_xyz789",
  scopeName: "process-payment"
});

logger.info("Payment received");
// Output includes traceId and spanId
```

**@param:** - The correlation context to include in all logs

**@returns:** A new CorrelatedLogger instance

*Source: [log-correlation.ts:359](packages/go-go-scope/src/log-correlation.ts#L359)*

---

### isCorrelatedLogger

```typescript
function isCorrelatedLogger(logger: Logger): logger is CorrelatedLogger
```

Check if a logger is a CorrelatedLogger. Type guard function to check the logger type at runtime.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `logger` | `Logger` | - The logger to check |

**Returns:** `logger is CorrelatedLogger`

True if the logger is a CorrelatedLogger, false otherwise

**Examples:**

```typescript
import { isCorrelatedLogger, CorrelatedLogger, ConsoleLogger } from "go-go-scope";

const correlated = new CorrelatedLogger(delegate, context);
const console = new ConsoleLogger("test");

console.log(isCorrelatedLogger(correlated)); // true
console.log(isCorrelatedLogger(console));    // false

// Use as type guard
function processLogger(logger: Logger) {
  if (isCorrelatedLogger(logger)) {
    // TypeScript knows logger is CorrelatedLogger here
    const context = logger.getCorrelationContext();
    console.log(context.traceId);
  }
}
```

**@param:** - The logger to check

**@returns:** True if the logger is a CorrelatedLogger, false otherwise

*Source: [log-correlation.ts:393](packages/go-go-scope/src/log-correlation.ts#L393)*

---

### getCorrelationContext

```typescript
function getCorrelationContext(logger: Logger): CorrelationContext | undefined
```

Extract correlation context from a logger if available. Safely retrieves the correlation context from any logger.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `logger` | `Logger` | - The logger to extract context from |

**Returns:** `CorrelationContext | undefined`

The correlation context if the logger is correlated, undefined otherwise

**Examples:**

```typescript
import { getCorrelationContext, scope } from "go-go-scope";

await using s = scope({
  name: "my-service",
  logCorrelation: true
});

s.task(async ({ logger }) => {
  const context = getCorrelationContext(logger);

  if (context) {
    console.log(`Trace: ${context.traceId}`);
    console.log(`Span: ${context.spanId}`);

    // Propagate to external service
    await callExternalAPI({
      headers: {
        "X-Trace-Id": context.traceId,
        "X-Span-Id": context.spanId
      }
    });
  }
});
```

```typescript
// Handling both correlated and non-correlated loggers
import { getCorrelationContext, ConsoleLogger } from "go-go-scope";

function getTraceId(logger: Logger): string | undefined {
  return getCorrelationContext(logger)?.traceId;
}

const correlatedLogger = createCorrelatedLogger(delegate, {
  traceId: "abc123",
  spanId: "xyz789",
  scopeName: "test"
});

const plainLogger = new ConsoleLogger("test");

console.log(getTraceId(correlatedLogger)); // "abc123"
console.log(getTraceId(plainLogger));      // undefined
```

**@param:** - The logger to extract context from

**@returns:** The correlation context if the logger is correlated, undefined otherwise

*Source: [log-correlation.ts:452](packages/go-go-scope/src/log-correlation.ts#L452)*

---

### createLogger

```typescript
function createLogger(scopeName: string, logger?: Logger, level?: "debug" | "info" | "warn" | "error"): Logger
```

Create a logger instance based on options. Returns the provided logger if given, otherwise creates a ConsoleLogger with the specified level, or a NoOpLogger if no level is provided. This is a convenience factory function used internally by scopes to determine which logger implementation to use based on configuration. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scopeName` | `string` | - The scope name for the logger prefix |
| `logger` (optional) | `Logger` | - Optional existing logger to use instead of creating a new one |
| `level` (optional) | `"debug" | "info" | "warn" | "error"` | - Optional log level for creating a ConsoleLogger |

**Returns:** `Logger`

A Logger instance (the provided logger, a new ConsoleLogger, or NoOpLogger)

**Examples:**

```typescript
import { createLogger, ConsoleLogger } from 'go-go-scope';

// Use existing logger
const existing = new ConsoleLogger('my-app', 'debug');
const logger1 = createLogger('scope1', existing);
// Returns: existing (same instance)

// Create console logger with level
const logger2 = createLogger('scope2', undefined, 'warn');
// Returns: ConsoleLogger with warn level

// Create no-op logger (default when no options provided)
const logger3 = createLogger('scope3');
// Returns: NoOpLogger
```

**@param:** - Optional log level for creating a ConsoleLogger

**@returns:** A Logger instance (the provided logger, a new ConsoleLogger, or NoOpLogger)

*Source: [logger.ts:198](packages/go-go-scope/src/logger.ts#L198)*

---

### createTaskLogger

```typescript
function createTaskLogger(parentLogger: Logger, scopeName: string, taskName: string, taskId: number): Logger
```

Create a child logger with task context. Prepends scope name, task name, and task ID to all log messages, making it easy to trace logs back to specific tasks. If the parent logger is a NoOpLogger, it is returned directly without creating a wrapper (preserving the no-op behavior).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `parentLogger` | `Logger` | - The parent logger to wrap |
| `scopeName` | `string` | - The scope name for the prefix |
| `taskName` | `string` | - The task name for the prefix |
| `taskId` | `number` | - The unique task ID for the prefix |

**Returns:** `Logger`

A Logger that prefixes all messages with task context

**Examples:**

```typescript
import { scope, ConsoleLogger, createTaskLogger } from 'go-go-scope';

const parentLogger = new ConsoleLogger('api', 'info');

// Create a task-specific logger
const taskLogger = createTaskLogger(parentLogger, 'api', 'fetchUser', 42);

taskLogger.info('Fetching user data');
// Output: [api/fetchUser#42] Fetching user data

taskLogger.warn('Retry attempt', { attempt: 2 });
// Output: [api/fetchUser#42] Retry attempt { attempt: 2 }

// Used automatically within scope.task()
await using s = scope({ name: 'worker', logger: parentLogger });

s.task(async ({ logger }) => {
  // logger is automatically a task logger with context
  logger.info('Processing'); // [worker/task#1] Processing
});
```

**@param:** - The unique task ID for the prefix

**@returns:** A Logger that prefixes all messages with task context

*Source: [logger.ts:246](packages/go-go-scope/src/logger.ts#L246)*

---

### parseMemoryLimit

```typescript
function parseMemoryLimit(limit: number | string): number
```

Parse memory limit string to bytes

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `limit` | `number | string` |  |

**Returns:** `number`

*Source: [memory-monitor.ts:57](packages/go-go-scope/src/memory-monitor.ts#L57)*

---

### getMemoryUsage

```typescript
function getMemoryUsage(): MemoryUsage
```

Get current memory usage

**Returns:** `MemoryUsage`

*Source: [memory-monitor.ts:82](packages/go-go-scope/src/memory-monitor.ts#L82)*

---

### isMemoryMonitoringAvailable

```typescript
function isMemoryMonitoringAvailable(): boolean
```

Check if memory monitoring is available in the current environment

**Returns:** `boolean`

*Source: [memory-monitor.ts:284](packages/go-go-scope/src/memory-monitor.ts#L284)*

---

### parallel

```typescript
function parallel<T extends readonly ((signal: AbortSignal) => Promise<unknown>)[]>(factories: T, options?: {
		concurrency?: number;
		signal?: AbortSignal;
		onProgress?: (
			completed: number,
			total: number,
			result: Result<unknown, unknown>,
		) => void;
		continueOnError?: boolean;
		/** Use worker threads for CPU-intensive tasks */
		workers?: {
			/** Number of worker threads */
			threads: number;
			/** Timeout in ms before idle workers are terminated. Default: 60000 */
			idleTimeout?: number;
		};
	}): Promise<ParallelResults<T>>
```

Runs multiple tasks in parallel with optional concurrency limit and progress tracking. All tasks run within a scope and are cancelled together on parent cancellation. Returns a tuple of Results where each position corresponds to the factory at the same index. This preserves individual return types for type-safe destructuring. Features: - Type-safe parallel execution with individual result types - Optional concurrency limiting - Progress tracking via callback - Configurable error handling (fail fast or continue on error) - Worker thread support for CPU-intensive tasks - Automatic cancellation propagation - Structured concurrency - all tasks cancelled together on failure

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `T` | - Array of factory functions that receive AbortSignal and create promises |
| `options` (optional) | `{
		concurrency?: number;
		signal?: AbortSignal;
		onProgress?: (
			completed: number,
			total: number,
			result: Result<unknown, unknown>,
		) => void;
		continueOnError?: boolean;
		/** Use worker threads for CPU-intensive tasks */
		workers?: {
			/** Number of worker threads */
			threads: number;
			/** Timeout in ms before idle workers are terminated. Default: 60000 */
			idleTimeout?: number;
		};
	}` | - Optional configuration for parallel execution |

**Returns:** `Promise<ParallelResults<T>>`

A Promise that resolves to a tuple of Results (one per factory)

**Examples:**

```typescript
import { parallel } from 'go-go-scope';

// With type inference - each result is typed individually
const [userResult, ordersResult, settingsResult] = await parallel([
  (signal) => fetchUser(1, { signal }),      // Result<Error, User>
  (signal) => fetchOrders({ signal }),       // Result<Error, Order[]>
  (signal) => fetchSettings({ signal }),     // Result<Error, Settings>
]);

// Destructure each result
const [userErr, user] = userResult;
const [ordersErr, orders] = ordersResult;
const [settingsErr, settings] = settingsResult;

if (!userErr && !ordersErr && !settingsErr) {
  console.log('All data loaded:', { user, orders, settings });
}
```

```typescript
// With concurrency limit
const results = await parallel(
  urls.map(url => (signal) => fetch(url, { signal }).then(r => r.json())),
  { concurrency: 5 } // Only 5 requests at a time
);

// Process results
for (const [err, data] of results) {
  if (!err) {
    console.log('Fetched:', data);
  }
}
```

```typescript
// With progress tracking
const results = await parallel(
  largeDataset.map(item => async (signal) => {
    return await processItem(item, { signal });
  }),
  {
    concurrency: 3,
    onProgress: (completed, total, result) => {
      const percentage = Math.round((completed / total) * 100);
      console.log(`Progress: ${percentage}% (${completed}/${total})`);

      if (result[0]) {
        console.log('Task failed:', result[0].message);
      }
    }
  }
);
```

```typescript
// Continue on error - get results even if some fail
const [r1, r2, r3, r4] = await parallel([
  () => fetch('/api/a'),  // Might succeed
  () => fetch('/api/b'),  // Might fail
  () => fetch('/api/c'),  // Might succeed
  () => fetch('/api/d'),  // Might fail
], { continueOnError: true });

// r1[0] is error if failed, undefined if succeeded
// r1[1] is data if succeeded, undefined if failed
console.log('A result:', r1[0] ? 'failed' : r1[1]);
console.log('B result:', r2[0] ? 'failed' : r2[1]);
```

```typescript
// With cancellation
const controller = new AbortController();

const promise = parallel(
  longRunningTasks.map(t => signal => t.execute({ signal })),
  { signal: controller.signal }
);

// Cancel after 5 seconds
setTimeout(() => controller.abort('Timeout'), 5000);

try {
  const results = await promise;
} catch (e) {
  console.log('Parallel execution was cancelled');
}
```

```typescript
// With worker threads for CPU-intensive tasks
const [hash1, hash2, hash3] = await parallel([
  () => computeHash(data1),  // CPU-intensive
  () => computeHash(data2),
  () => computeHash(data3),
], {
  workers: {
    threads: 3,           // Use 3 worker threads
    idleTimeout: 30000    // Keep workers alive for 30s
  }
});
```

```typescript
// Error handling - fail fast (default)
try {
  const results = await parallel([
    () => fetch('/api/a'),
    () => fetch('/api/b'),  // If this fails immediately...
    () => fetch('/api/c'),
  ]);
} catch (error) {
  // Other tasks are cancelled, error is thrown
  console.log('A task failed:', error);
}
```

**@typeParam:** T - Tuple type of factory functions

**@param:** - Timeout in ms before idle workers are terminated. Default: 60000

**@returns:** A Promise that resolves to a tuple of Results (one per factory)

**@see:** {@link Scope#parallel} - For scoped parallel execution

*Source: [parallel.ts:207](packages/go-go-scope/src/parallel.ts#L207)*

---

### performanceMonitor

```typescript
function performanceMonitor(scope: Scope<Record<string, unknown>>, options?: PerformanceMonitorOptions): PerformanceMonitor
```

Create a performance monitor for a scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<Record<string, unknown>>` |  |
| `options` (optional) | `PerformanceMonitorOptions` |  |

**Returns:** `PerformanceMonitor`

*Source: [performance.ts:226](packages/go-go-scope/src/performance.ts#L226)*

---

### benchmarkInWorker

```typescript
function benchmarkInWorker(name: string, fn: () => void, options: BenchmarkOptions): Promise<BenchmarkResult>
```

Run a benchmark in a worker thread

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `fn` | `() => void` |  |
| `options` | `BenchmarkOptions` |  |

**Returns:** `Promise<BenchmarkResult>`

*Source: [performance.ts:289](packages/go-go-scope/src/performance.ts#L289)*

---

### benchmark

```typescript
function benchmark(name: string, fn: () => Promise<void> | void, options: BenchmarkOptions = {}): Promise<BenchmarkResult>
```

Run a benchmark

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `fn` | `() => Promise<void> | void` |  |
| `options` (optional) | `BenchmarkOptions` |  |

**Returns:** `Promise<BenchmarkResult>`

*Source: [performance.ts:360](packages/go-go-scope/src/performance.ts#L360)*

---

### hasPlugin

```typescript
function hasPlugin(scope: Scope, pluginName: string): boolean
```

Check if a plugin is installed on a scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `pluginName` | `string` |  |

**Returns:** `boolean`

*Source: [plugin.ts:49](packages/go-go-scope/src/plugin.ts#L49)*

---

### registerPlugin

```typescript
function registerPlugin(scope: Scope, plugin: ScopePlugin): void
```

Register a plugin as installed on a scope

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `plugin` | `ScopePlugin` |  |

**Returns:** `void`

*Source: [plugin.ts:56](packages/go-go-scope/src/plugin.ts#L56)*

---

### poll

```typescript
function poll<T>(fn: (signal: AbortSignal) => Promise<T>, onValue: (value: T) => void | Promise<void>, options: PollOptions = {}): PollController
```

Polls a function at regular intervals with structured concurrency. Automatically starts polling and returns a controller for managing the polling lifecycle. Polling automatically stops when: - The parent scope is disposed - The abort signal is triggered - The `stop()` method is called - The controller is disposed via `Symbol.dispose` Features: - Configurable polling interval - Immediate or delayed first execution - Automatic error handling (continues polling on errors) - Status tracking (poll count, timing) - Start/stop control - Automatic cleanup on scope disposal Can be async. Errors in this callback don't stop polling.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(signal: AbortSignal) => Promise<T>` | - The async function to poll. Receives AbortSignal for cancellation. |
| `onValue` | `(value: T) => void | Promise<void>` | - Callback invoked with each successful poll result.
Can be async. Errors in this callback don't stop polling. |
| `options` (optional) | `PollOptions` | - Polling configuration options |

**Returns:** `PollController`

A PollController for starting, stopping, and monitoring the poll

**Examples:**

```typescript
import { scope } from 'go-go-scope';
import { poll } from 'go-go-scope/poll';

await using s = scope();

// Poll for configuration updates every 30 seconds
const controller = poll(
  async ({ signal }) => {
    const response = await fetch('/api/config', { signal });
    return response.json();
  },
  (config) => {
    console.log('Config updated:', config);
    updateApplicationConfig(config);
  },
  { interval: 30000 }
);

// Polling starts immediately (default)
// Scope disposal automatically stops polling
```

```typescript
// Poll with delayed start
await using s = scope();

const controller = poll(
  ({ signal }) => fetchMetrics({ signal }),
  (metrics) => updateDashboard(metrics),
  {
    interval: 10000,   // 10 second interval
    immediate: false   // Don't poll immediately, wait for first interval
  }
);

// Manually start when ready
controller.start();

// Stop when not needed
setTimeout(() => controller.stop(), 60000);
```

```typescript
// Poll with status monitoring
await using s = scope();

const controller = poll(
  ({ signal }) => checkJobStatus(jobId, { signal }),
  (status) => {
    if (status === 'complete') {
      console.log('Job done!');
      controller.stop();
    }
  },
  { interval: 5000 }
);

// Check status periodically
setInterval(() => {
  const status = controller.status();
  console.log(`Polled ${status.pollCount} times, next in ${status.timeUntilNext}ms`);
}, 1000);
```

```typescript
// Poll with manual disposal
await using s = scope();

{
  using controller = poll(
    ({ signal }) => fetchNotifications({ signal }),
    (notifications) => displayNotifications(notifications),
    { interval: 60000 }
  );

  // Polling runs while in scope
  await delay(300000); // 5 minutes

} // Controller automatically disposed, polling stops
```

```typescript
// Poll with cancellation
const controller = new AbortController();

const pollController = poll(
  ({ signal }) => fetchData({ signal }),
  (data) => processData(data),
  {
    interval: 5000,
    signal: controller.signal
  }
);

// Cancel polling externally
setTimeout(() => controller.abort('User cancelled'), 30000);
```

```typescript
// Poll with error resilience
await using s = scope();

poll(
  async ({ signal }) => {
    // This might fail occasionally
    return await fetchUnreliableEndpoint({ signal });
  },
  (data) => {
    console.log('Got data:', data);
  },
  { interval: 10000 }
);

// Even if fetch fails, polling continues
// Errors are logged but don't stop the poll
```

```typescript
// Multiple polls in one scope
await using s = scope();

// Poll different data sources
const metricsPoll = s.poll(
  ({ signal }) => fetchMetrics({ signal }),
  (m) => updateMetrics(m),
  { interval: 5000 }
);

const logsPoll = s.poll(
  ({ signal }) => fetchLogs({ signal }),
  (l) => updateLogs(l),
  { interval: 10000 }
);

const healthPoll = s.poll(
  ({ signal }) => checkHealth({ signal }),
  (h) => updateHealth(h),
  { interval: 30000 }
);

// All polls stop when scope is disposed
```

**@typeParam:** T - The type of value returned by the polled function

**@param:** - Run immediately on start, or wait for first interval (default: true)

**@returns:** A PollController for starting, stopping, and monitoring the poll

**@throws:** If the provided signal is already aborted

**@see:** {@link Scope#poll} - For scoped polling

*Source: [poll.ts:412](packages/go-go-scope/src/poll.ts#L412)*

---

### race

```typescript
function race<T>(factories: readonly ((signal: AbortSignal) => Promise<T>)[], options?: RaceOptions): Promise<Result<unknown, T>>
```

Races multiple tasks - the first to settle wins, others are cancelled. Implements structured concurrency: all tasks run within a scope and are automatically cancelled when a winner is determined. This prevents resource leaks from abandoned tasks. Features: - First settled task wins (success or error by default) - Optional `requireSuccess` to wait for first successful result - Timeout support with automatic cancellation - Concurrency limiting for controlled execution - Staggered start (hedging pattern) for latency-sensitive operations - Worker thread support for CPU-intensive tasks - Structured concurrency - losers are cancelled

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `readonly ((signal: AbortSignal) => Promise<T>)[]` | - Array of factory functions that receive AbortSignal and create promises |
| `options` (optional) | `RaceOptions` | - Optional race configuration |

**Returns:** `Promise<Result<unknown, T>>`

A Promise that resolves to a Result tuple of the winning task

**Examples:**

```typescript
import { race } from 'go-go-scope';

// Basic race - first to settle wins
const [err, winner] = await race([
  ({ signal }) => fetch('https://api-primary.com/data', { signal }),
  ({ signal }) => fetch('https://api-backup.com/data', { signal }),
]);

if (!err) {
  console.log('Winner:', winner);
}
// Losing fetch is automatically cancelled
```

```typescript
// Race for first success only
const [err, winner] = await race([
  ({ signal }) => fetchWithRetry('https://a.com', { signal }),
  ({ signal }) => fetchWithRetry('https://b.com', { signal }),
], { requireSuccess: true });

// If first task errors, race continues until one succeeds
// If all fail, returns aggregate error
```

```typescript
// Race with timeout
const [err, winner] = await race([
  ({ signal }) => fetch('https://slow.com', { signal }),
  ({ signal }) => fetch('https://fast.com', { signal }),
], { timeout: 5000 });

if (err) {
  console.log('No winner within 5 seconds');
}
```

```typescript
// Hedging pattern - staggered start
// Start first task, wait 50ms, start second if still running
const [err, winner] = await race([
  ({ signal }) => fetchFromPrimary({ signal }),
  ({ signal }) => fetchFromBackup({ signal }),
  ({ signal }) => fetchFromFallback({ signal }),
], {
  staggerDelay: 50,           // 50ms between starts
  staggerMaxConcurrent: 2     // Max 2 tasks running concurrently
});

// Reduces load on backup servers while maintaining low latency
```

```typescript
// Race with limited concurrency
const [err, winner] = await race([
  () => searchEngineA(query),
  () => searchEngineB(query),
  () => searchEngineC(query),
  () => searchEngineD(query),
  () => searchEngineE(query),
], { concurrency: 2 });

// Only 2 engines queried at a time
// If first fails and requireSuccess is true, next starts
```

```typescript
// Race with worker threads for CPU-intensive tasks
const [err, hash] = await race([
  () => computeHashVariantA(data),
  () => computeHashVariantB(data),
  () => computeHashVariantC(data),
], {
  workers: { threads: 3 },
  requireSuccess: true
});

// Fastest algorithm wins, others cancelled
```

```typescript
// Race with cancellation
const controller = new AbortController();

const racePromise = race([
  ({ signal }) => longRunningTask1({ signal }),
  ({ signal }) => longRunningTask2({ signal }),
], { signal: controller.signal });

// Cancel the race externally
setTimeout(() => controller.abort('User cancelled'), 1000);

const [err, winner] = await racePromise;
if (err) {
  console.log('Race was cancelled');
}
```

```typescript
// Database query with multiple strategies
const [err, result] = await race([
  // Try cache first (usually fast)
  () => cache.get(key),

  // If cache miss, query primary DB
  () => primaryDB.query(sql),

  // Fallback to replica if primary slow
  () => replicaDB.query(sql),
], {
  requireSuccess: true,
  staggerDelay: 10  // Small delay between strategies
});
```

**@typeParam:** T - The type of value returned by the task factories

**@param:** - Maximum concurrent tasks when using staggered start

**@returns:** A Promise that resolves to a Result tuple of the winning task

**@see:** {@link RaceOptions} - For all available options

*Source: [race.ts:194](packages/go-go-scope/src/race.ts#L194)*

---

### debounce

```typescript
function debounce<T, Args extends unknown[]>(scope: DisposableScope, fn: (...args: Args) => Promise<T>, options: DebounceOptions = {}): (...args: Args) => Promise<Result<unknown, T>>
```

Create a debounced function that delays invoking the provided function until after `wait` milliseconds have elapsed since the last time it was invoked. The debounced function returns a Promise that resolves with the result of the function execution. If the scope is disposed before execution, the promise resolves with an error. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `DisposableScope` | - The scope to bind the debounced function to |
| `fn` | `(...args: Args) => Promise<T>` | - The function to debounce |
| `options` (optional) | `DebounceOptions` | - Debounce configuration options |

**Returns:** `(...args: Args) => Promise<Result<unknown, T>>`

A debounced function that returns a Promise

**Examples:**

```typescript
import { scope } from "go-go-scope";

await using s = scope();

// Basic debounce - execute 300ms after last call
const search = debounce(s, async (query: string) => {
  const results = await fetchSearchResults(query);
  return results;
}, { wait: 300 });

// User typing triggers multiple calls
await search("h");      // Will be cancelled
await search("he");     // Will be cancelled
await search("hel");    // Will be cancelled
await search("hello");  // Executes after 300ms

// Leading edge - execute immediately, then debounce
const save = debounce(s, async (data: string) => {
  await saveToServer(data);
}, { wait: 1000, leading: true, trailing: false });

// Trailing edge only (default)
const log = debounce(s, async (message: string) => {
  await writeToLog(message);
}, { wait: 500, trailing: true });

// Use with Result tuple
const [err, results] = await search("query");
if (err) {
  console.error("Search failed:", err);
} else {
  console.log("Results:", results);
}
```

**@template:** Argument types of the debounced function

**@param:** - Execute on the trailing edge after wait (default: true)

**@returns:** A debounced function that returns a Promise

**@see:** {@link DebounceOptions} Options interface

*Source: [rate-limiting.ts:92](packages/go-go-scope/src/rate-limiting.ts#L92)*

---

### throttle

```typescript
function throttle<T, Args extends unknown[]>(scope: DisposableScope, fn: (...args: Args) => Promise<T>, options: ThrottleOptions = {}): (...args: Args) => Promise<Result<unknown, T>>
```

Create a throttled function that only invokes the provided function at most once per every `interval` milliseconds. The throttled function returns a Promise that resolves with the result of the function execution. If throttled, returns a pending promise that resolves when the next execution occurs (if trailing is enabled). #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `DisposableScope` | - The scope to bind the throttled function to |
| `fn` | `(...args: Args) => Promise<T>` | - The function to throttle |
| `options` (optional) | `ThrottleOptions` | - Throttle configuration options |

**Returns:** `(...args: Args) => Promise<Result<unknown, T>>`

A throttled function that returns a Promise

**Examples:**

```typescript
import { scope } from "go-go-scope";

await using s = scope();

// Basic throttle - execute at most once per second
const save = throttle(s, async (data: string) => {
  await saveToServer(data);
  return { saved: true };
}, { interval: 1000 });

// Multiple calls within 1 second
const r1 = await save("data1");  // Executes immediately
const r2 = await save("data2");  // Throttled, returns undefined
const r3 = await save("data3");  // Throttled, returns undefined
// After 1 second, can execute again

// With trailing execution
const log = throttle(s, async (event: Event) => {
  await sendAnalytics(event);
}, { interval: 5000, leading: true, trailing: true });

// Leading: false, Trailing: true
const update = throttle(s, async (state: State) => {
  await updateDatabase(state);
}, { interval: 1000, leading: false, trailing: true });

await update(state1);  // Schedules execution after 1s
await update(state2);  // Reschedules with new state
// Executes with state2 after 1s of inactivity

// Scroll handler - limit to 60fps equivalent
const handleScroll = throttle(s, async () => {
  await updateScrollPosition();
}, { interval: 16, leading: true });  // ~60fps

// Use with Result tuple
const [err, result] = await save("important data");
if (err) {
  console.error("Save failed:", err);
}
```

**@template:** Argument types of the throttled function

**@param:** - Execute on the trailing edge (default: false)

**@returns:** A throttled function that returns a Promise

**@see:** {@link ThrottleOptions} Options interface

*Source: [rate-limiting.ts:247](packages/go-go-scope/src/rate-limiting.ts#L247)*

---

### exponentialBackoff

```typescript
function exponentialBackoff({
	initial = 100,
	max = 30000,
	multiplier = 2,
	jitter = 0,
	fullJitter = false,
}: {
	/** Initial delay in milliseconds (default: 100) */
	initial?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	max?: number;
	/** Multiplier for each attempt (default: 2) */
	multiplier?: number;
	/** Jitter factor 0-1 (default: 0). 0 = no jitter, 1 = full jitter */
	jitter?: number;
	/** Use AWS-style full jitter (random value between 0 and calculated delay) */
	fullJitter?: boolean;
} = {}): RetryDelayFn
```

Exponential backoff with optional jitter. Returns a delay function that increases exponentially with each attempt, optionally capped at a maximum delay and with optional jitter to prevent thundering herd problems. Supports both partial jitter (jitter factor 0-1) and full jitter (AWS-style) where delays are random between 0 and the calculated delay. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `{
	initial = 100,
	max = 30000,
	multiplier = 2,
	jitter = 0,
	fullJitter = false,
}` (optional) | `{
	/** Initial delay in milliseconds (default: 100) */
	initial?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	max?: number;
	/** Multiplier for each attempt (default: 2) */
	multiplier?: number;
	/** Jitter factor 0-1 (default: 0). 0 = no jitter, 1 = full jitter */
	jitter?: number;
	/** Use AWS-style full jitter (random value between 0 and calculated delay) */
	fullJitter?: boolean;
}` | - Configuration options for exponential backoff |

**Returns:** `RetryDelayFn`

Delay function for retry option

**Examples:**

```typescript
import { scope, exponentialBackoff } from "go-go-scope";

await using s = scope();

// Basic exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: exponentialBackoff({ initial: 100, max: 5000 })
  }
});

// With 30% jitter to prevent thundering herd
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: exponentialBackoff({ initial: 100, max: 5000, jitter: 0.3 })
  }
});
// Delays: ~70-130ms, ~140-260ms, ~280-520ms, etc.

// With full jitter (AWS-style)
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: exponentialBackoff({ initial: 100, max: 5000, fullJitter: true })
  }
});
// Delays: 0-100ms, 0-200ms, 0-400ms, 0-800ms, etc.
```

**@param:** - Use AWS-style full jitter (random value between 0 and calculated delay)

**@returns:** Delay function for retry option

**@see:** {@link decorrelatedJitter} For Azure-style jitter

*Source: [retry-strategies.ts:80](packages/go-go-scope/src/retry-strategies.ts#L80)*

---

### jitter

```typescript
function jitter(baseDelay: number, jitterFactor = 0.1): RetryDelayFn
```

Fixed delay with jitter. Returns a delay function that produces a fixed base delay with random jitter applied. Useful when you want consistent delays with some randomization to prevent synchronization. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `baseDelay` | `number` | - Base delay in milliseconds |
| `jitterFactor` (optional) | `unknown` | - Jitter factor 0-1 (default: 0.1). 0 = no jitter, 1 = full jitter |

**Returns:** `RetryDelayFn`

Delay function for retry option

**Examples:**

```typescript
import { scope, jitter } from "go-go-scope";

await using s = scope();

// Fixed 1000ms with 20% jitter: ~800-1200ms each attempt
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: jitter(1000, 0.2)
  }
});

// For API rate limiting with consistent backoff
await s.task(() => callRateLimitedApi(), {
  retry: {
    max: 10,
    delay: jitter(2000, 0.1)  // ~1800-2200ms
  }
});

// No jitter (consistent delays)
await s.task(() => fetchData(), {
  retry: {
    max: 3,
    delay: jitter(1000, 0)  // Exactly 1000ms each time
  }
});
```

**@param:** - Jitter factor 0-1 (default: 0.1). 0 = no jitter, 1 = full jitter

**@returns:** Delay function for retry option

**@see:** {@link decorrelatedJitter} For Azure-style jitter

*Source: [retry-strategies.ts:169](packages/go-go-scope/src/retry-strategies.ts#L169)*

---

### linear

```typescript
function linear(baseDelay: number, increment: number): RetryDelayFn
```

Linear increasing delay. Returns a delay function that increases linearly with each attempt. The delay for attempt n is: baseDelay + increment * (n - 1) #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `baseDelay` | `number` | - Base delay in milliseconds for first attempt |
| `increment` | `number` | - Amount to add each attempt in milliseconds |

**Returns:** `RetryDelayFn`

Delay function for retry option

**Examples:**

```typescript
import { scope, linear } from "go-go-scope";

await using s = scope();

// Linear backoff: 100ms, 150ms, 200ms, 250ms, 300ms
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: linear(100, 50)
  }
});

// Slower progression: 500ms, 700ms, 900ms, 1100ms, 1300ms
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: linear(500, 200)
  }
});

// For predictable, non-aggressive backoff
await s.task(() => fetchData(), {
  retry: {
    max: 10,
    delay: linear(1000, 500)  // Increases by 0.5s each attempt
  }
});
```

**@param:** - Amount to add each attempt in milliseconds

**@returns:** Delay function for retry option

**@see:** {@link jitter} For fixed delays with jitter

*Source: [retry-strategies.ts:225](packages/go-go-scope/src/retry-strategies.ts#L225)*

---

### decorrelatedJitter

```typescript
function decorrelatedJitter({
	initial = 100,
	max = 30000,
}: {
	/** Initial delay in milliseconds (default: 100) */
	initial?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	max?: number;
} = {}): RetryDelayFn
```

Decorrelated jitter (Microsoft Azure-style). Returns a delay function that uses decorrelated jitter, which is better for high-contention scenarios. Each delay is calculated as a random value between the initial delay and 3x the previous delay, capped at max. This strategy prevents clusters of retries that can occur with simple exponential backoff. #__PURE__

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `{
	initial = 100,
	max = 30000,
}` (optional) | `{
	/** Initial delay in milliseconds (default: 100) */
	initial?: number;
	/** Maximum delay in milliseconds (default: 30000) */
	max?: number;
}` | - Configuration options for decorrelated jitter |

**Returns:** `RetryDelayFn`

Delay function for retry option

**Examples:**

```typescript
import { scope, decorrelatedJitter } from "go-go-scope";

await using s = scope();

// Azure-style decorrelated jitter
await s.task(() => fetchData(), {
  retry: {
    max: 5,
    delay: decorrelatedJitter({ initial: 100, max: 5000 })
  }
});
// Possible delays: 100-300ms, 100-900ms, 100-2700ms (capped at 5000ms)

// Recommended for distributed systems with high contention
await s.task(() => accessSharedResource(), {
  retry: {
    max: 10,
    delay: decorrelatedJitter({ initial: 50, max: 10000 })
  }
});

// For database connection retries
await s.task(() => connectToDatabase(), {
  retry: {
    max: 5,
    delay: decorrelatedJitter({ initial: 100, max: 30000 })
  }
});
```

**@param:** - Maximum delay in milliseconds (default: 30000)

**@returns:** Delay function for retry option

**@see:** {@link jitter} For simple jitter

*Source: [retry-strategies.ts:283](packages/go-go-scope/src/retry-strategies.ts#L283)*

---

### extractTransferables

```typescript
function extractTransferables(data: unknown): ArrayBuffer[]
```

Extract all ArrayBuffers from data for zero-copy transfer to workers. Recursively searches through objects and arrays.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `data` | `unknown` |  |

**Returns:** `ArrayBuffer[]`

*Source: [scope.ts:78](packages/go-go-scope/src/scope.ts#L78)*

---

### createSharedWorker

```typescript
function createSharedWorker(modulePath: string, options?: SharedWorkerOptions): Promise<SharedWorkerModule>
```

Create a shared worker module that can be used across multiple scopes.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `modulePath` | `string` | - Path to the worker module file |
| `options` (optional) | `SharedWorkerOptions` | - Options for module validation |

**Returns:** `Promise<SharedWorkerModule>`

Initialized SharedWorkerModule

**Examples:**

```typescript
// Create shared worker for image processing
const imageWorker = await createSharedWorker('./image-processor.js');

// Use across different scopes
await using scope1 = scope();
const [err1, thumb] = await scope1.task(
  imageWorker.export('createThumbnail'),
  { worker: true, data: { image: buffer, size: 256 } }
);

await using scope2 = scope();
const [err2, compressed] = await scope2.task(
  imageWorker.export('compress'),
  { worker: true, data: { image: buffer, quality: 0.8 } }
);
```

**@param:** - Options for module validation

**@returns:** Initialized SharedWorkerModule

*Source: [shared-worker.ts:160](packages/go-go-scope/src/shared-worker.ts#L160)*

---

### createTokenBucket

```typescript
function createTokenBucket(options: TokenBucketOptions): TokenBucket
```

Create a token bucket rate limiter. Factory function for creating TokenBucket instances. Supports both local (in-memory) and distributed (via cache provider) rate limiting.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `TokenBucketOptions` | - Configuration options for the token bucket |

**Returns:** `TokenBucket`

A new token bucket instance

**Examples:**

```typescript
// Local rate limiter - 100 requests per second burst
const localBucket = createTokenBucket({
  capacity: 100,
  refillRate: 10  // 10 tokens per second
});

// Distributed rate limiter using Redis
const distributedBucket = createTokenBucket({
  capacity: 1000,
  refillRate: 100,
  cache: redisAdapter,
  key: 'api-rate-limit:endpoint-users'
});

// Use the bucket
await localBucket.acquire(1, async () => {
  await processRequest();
});

// Check without blocking
if (await localBucket.tryConsume(1)) {
  await processRequest();
} else {
  console.log('Rate limited');
}
```

**@param:** - Key for distributed rate limiting (required if cache is provided)

**@returns:** A new token bucket instance

**@throws:** If cache is provided without a key

**@see:** {@link TokenBucketOptions} Configuration options

*Source: [token-bucket.ts:543](packages/go-go-scope/src/token-bucket.ts#L543)*

---

### getDefaultWorkerCount

```typescript
function getDefaultWorkerCount(): number
```

Get default worker count based on CPU cores

**Returns:** `number`

*Source: [worker-pool.ts:866](packages/go-go-scope/src/worker-pool.ts#L866)*

---

### workerPool

```typescript
function workerPool(options?: WorkerPoolOptions): WorkerPool
```

Create a worker pool with the given options. Convenience function for API consistency.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `WorkerPoolOptions` |  |

**Returns:** `WorkerPool`

*Source: [worker-pool.ts:885](packages/go-go-scope/src/worker-pool.ts#L885)*

---

## Classes

### Batch

```typescript
class Batch<T, R>
```

Batch collector that accumulates items and processes them in batches. Automatically flushes when batch is full or timeout is reached.

**Examples:**

```typescript
await using s = scope()

const batcher = s.batch({
  size: 100,
  timeout: 5000,
  process: async (users) => {
    await db.users.insertMany(users)
    return users.length
  }
})

// Add items - they accumulate
await batcher.add({ name: 'Alice' })
await batcher.add({ name: 'Bob' })

// Manually flush when needed
const [err, count] = await batcher.flush()

// Auto-flush on scope disposal
```

*Source: [batch.ts:47](packages/go-go-scope/src/batch.ts#L47)*

---

### BroadcastChannel

```typescript
class BroadcastChannel<T>
```

BroadcastChannel class for go-go-scope - Pub/sub pattern Unlike regular Channel where each message goes to one consumer, BroadcastChannel sends each message to ALL active consumers. A BroadcastChannel for pub/sub patterns. All consumers receive every message (unlike regular {@link Channel} where messages are distributed to one consumer each). This is useful for event broadcasting, notifications, and fan-out scenarios. Features: - Multiple subscribers receive all messages - Per-subscriber message queuing - Automatic cleanup on scope disposal - AsyncIterable support for subscribers #__PURE__

**Examples:**

```typescript
await using s = scope();
const broadcast = s.broadcast<string>();

// Subscribe multiple consumers
s.task(async () => {
  for await (const msg of broadcast.subscribe()) {
    console.log('Consumer 1:', msg);
  }
});

s.task(async () => {
  for await (const msg of broadcast.subscribe()) {
    console.log('Consumer 2:', msg);
  }
});

// Publish messages (all consumers receive each message)
await broadcast.send('hello');
await broadcast.send('world');
broadcast.close();
```

```typescript
// Real-world: System notifications
await using s = scope();
const notifications = s.broadcast<{
  type: 'info' | 'warning' | 'error';
  message: string;
}>();

// Logger subscriber
s.task(async () => {
  for await (const notif of notifications.subscribe()) {
    console.log(`[${notif.type.toUpperCase()}] ${notif.message}`);
  }
});

// Analytics subscriber
s.task(async () => {
  for await (const notif of notifications.subscribe()) {
    await trackEvent('notification', { type: notif.type });
  }
});

// UI subscriber
s.task(async () => {
  for await (const notif of notifications.subscribe()) {
    showToast(notif.type, notif.message);
  }
});

// Publish from anywhere
await notifications.send({ type: 'info', message: 'System ready' });
await notifications.send({ type: 'warning', message: 'Low memory' });
```

**@see:** {@link Scope.broadcast} for creating broadcast channels

*Source: [broadcast-channel.ts:84](packages/go-go-scope/src/broadcast-channel.ts#L84)*

---

### InMemoryCache

```typescript
class InMemoryCache
```

In-memory cache provider with TTL and LRU (Least Recently Used) support. This cache automatically evicts entries when: - The maximum size is reached (LRU eviction) - An entry's TTL expires For distributed caching across multiple processes, configure a persistence provider in your scope options instead.

**Examples:**

```typescript
import { InMemoryCache } from "go-go-scope";

// Create cache with default size (1000)
const cache = new InMemoryCache();

// Create cache with custom size
const cache = new InMemoryCache({ maxSize: 500 });

// Basic operations
await cache.set("key", "value", 60000); // 60 second TTL
const value = await cache.get("key");
const exists = await cache.has("key");
await cache.delete("key");

// Pattern matching for keys
await cache.set("user:1", { name: "Alice" });
await cache.set("user:2", { name: "Bob" });
const userKeys = await cache.keys("user:*"); // ["user:1", "user:2"]

// Statistics
const stats = cache.stats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);

// Clean up (disposes resources)
cache[Symbol.dispose]();
```

**@implements:** *

*Source: [cache.ts:100](packages/go-go-scope/src/cache.ts#L100)*

---

### Channel

```typescript
class Channel<T>
```

A Channel for Go-style concurrent communication between tasks. Channels provide a typed, buffered communication mechanism that supports multiple producers and consumers. They implement backpressure strategies for when the buffer is full and automatically close when the parent scope is disposed. Features: - Ring buffer for O(1) enqueue/dequeue operations - Multiple backpressure strategies: 'block', 'drop-oldest', 'drop-latest', 'error', 'sample' - AsyncIterable support for for-await-of loops - Automatic cleanup on scope disposal - Functional operations: map, filter, reduce, take #__PURE__

**Examples:**

```typescript
await using s = scope();

// Create a buffered channel with capacity 10
const ch = s.channel<string>(10);

// Producer task
s.task(async () => {
  for (const item of ['a', 'b', 'c']) {
    await ch.send(item);
  }
  ch.close();
});

// Consumer using for-await-of
for await (const value of ch) {
  console.log(value); // 'a', 'b', 'c'
}
```

```typescript
// Using backpressure strategies
await using s = scope();

// Drop oldest when buffer is full
const ch = s.channel<number>({
  capacity: 5,
  backpressure: 'drop-oldest',
  onDrop: (value) => console.log(`Dropped: ${value}`)
});

// Send without blocking
for (let i = 0; i < 100; i++) {
  await ch.send(i); // Older values will be dropped when full
}
```

**@see:** {@link BroadcastChannel} for pub/sub communication

*Source: [channel.ts:232](packages/go-go-scope/src/channel.ts#L232)*

---

### InMemoryCheckpointProvider

```typescript
class InMemoryCheckpointProvider
```

In-memory checkpoint provider for testing or simple use cases. Stores checkpoints in a Map. All data is lost when the process exits. For production use with persistence across restarts, use a distributed provider from @go-go-scope/persistence-* packages.

**Examples:**

```typescript
import { scope, InMemoryCheckpointProvider } from "go-go-scope";

const provider = new InMemoryCheckpointProvider();

await using s = scope({
persistence: { checkpoint: provider }
});

// Use checkpoint in tasks
const [err, result] = await s.task(
async ({ checkpoint }) => {
const state = checkpoint?.data ?? { count: 0 };
await checkpoint.save({ count: state.count + 1 });
return state.count + 1;
},
{ id: 'counter-task' }
);

// List all checkpoints for a task
const checkpoints = await provider.list('counter-task');
console.log(`Saved ${checkpoints.length} checkpoints`);

// Clean up old checkpoints (keep only last 5)
await provider.cleanup('counter-task', 5);

// Delete all checkpoints for a task
await provider.deleteAll('counter-task');
```

**@go-go-scope:** /persistence-* packages.

**@implements:** *

*Source: [checkpoint.ts:120](packages/go-go-scope/src/checkpoint.ts#L120)*

---

### CircuitBreaker

```typescript
class CircuitBreaker
```

Circuit Breaker implementation for fault tolerance. The circuit breaker pattern prevents cascading failures by stopping requests to a failing service. It operates in three states: - **Closed**: Normal operation, requests pass through - **Open**: Service is failing, requests fail fast without calling the service - **Half-Open**: Testing if the service has recovered, limited requests allowed Features: - Automatic state transitions based on failure thresholds - Configurable reset timeout - Sliding window for failure tracking - Adaptive thresholds based on error rates - Event subscriptions for monitoring - Success threshold for recovery confirmation Created automatically when `circuitBreaker` options are passed to {@link scope}. Can also be used standalone for custom circuit breaking logic. #__PURE__

**Examples:**

```typescript
await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 10000
  }
});

// All tasks in this scope are protected by the circuit breaker
const result = await s.task(async ({ signal }) => {
  return await fetchData(signal);
});
```

```typescript
// Standalone usage
const cb = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 5000,
  successThreshold: 2 // Need 2 successes to close from half-open
});

try {
  const data = await cb.execute(async (signal) => {
    return await unreliableApi.call(signal);
  });
} catch (error) {
  if (error.message === 'Circuit breaker is open') {
    console.log('Service temporarily unavailable');
  }
}
```

```typescript
// Monitoring circuit state
cb.on('stateChange', (from, to, failures) => {
  console.log(`Circuit: ${from} -> ${to} (failures: ${failures})`);
});

cb.on('open', (failures) => {
  alertEngineer(`Circuit opened after ${failures} failures`);
});

cb.on('close', () => {
  console.log('Service recovered');
});
```

**@see:** {@link Scope} for automatic circuit breaker integration

*Source: [circuit-breaker.ts:121](packages/go-go-scope/src/circuit-breaker.ts#L121)*

---

### UnknownError

```typescript
class UnknownError
```

Built-in error classes for go-go-scope Provides specialized error types for different failure scenarios in concurrent operations. Each error class has a `_tag` property for type-safe error handling and discrimination. UnknownError - A catch-all error class for system/infrastructure errors. Used as the default for `systemErrorClass` to wrap untagged (non-business) errors. Has a `_tag` property for consistency with taggedError-style errors. This error is typically thrown when: - Network requests fail - Database connections timeout - Unexpected exceptions occur in task execution - Errors don't have a `_tag` property (indicating they're not business errors) #__PURE__

**Examples:**

```typescript
import { scope, UnknownError } from 'go-go-scope'

await using s = scope()

const [err, data] = await s.task(() => fetchData())
if (err instanceof UnknownError) {
  // System error (network, timeout, etc.)
  console.error('System failure:', err.message)
}
```

```typescript
// Using with custom error class for typed error handling
import { taggedError } from 'go-go-try'

const DatabaseError = taggedError('DatabaseError')

await using s = scope({
  systemErrorClass: DatabaseError  // Wraps unknown errors in DatabaseError
})

const [err, user] = await s.task(() => db.query('SELECT * FROM users'))
if (err) {
  // err is DatabaseError (system error) or a tagged business error
  console.error(err._tag) // 'DatabaseError' for system failures
}
```

*Source: [errors.ts:53](packages/go-go-scope/src/errors.ts#L53)*

---

### AbortError

```typescript
class AbortError
```

AbortError - Internal marker for abort signal reasons. Used to distinguish abort reasons from user-thrown errors. The reason is preserved and re-thrown without wrapping. This error is thrown when: - A task is cancelled via AbortSignal - A scope is disposed while tasks are running - A timeout is reached and the task is aborted - A parent scope signals cancellation to child tasks #__PURE__

**Examples:**

```typescript
import { scope, AbortError } from 'go-go-scope'

await using s = scope({ timeout: 5000 })

const [err, result] = await s.task(async ({ signal }) => {
  await longRunningOperation(signal)
  return 'completed'
})

if (err instanceof AbortError) {
  console.log('Task was aborted:', err.reason)
  // err.reason contains the original abort reason (e.g., timeout message)
}
```

```typescript
// Handling cancellation in a task
await using s = scope()

const [err, data] = await s.task(async ({ signal }) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve('done'), 10000)

    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new Error('Cancelled by user'))
    })
  })
})

// Dispose the scope to trigger cancellation
await s[Symbol.asyncDispose]()
```

*Source: [errors.ts:120](packages/go-go-scope/src/errors.ts#L120)*

---

### ChannelFullError

```typescript
class ChannelFullError
```

ChannelFullError - Error thrown when channel buffer is full with 'error' backpressure strategy. This error is thrown by {@link Channel.send} when: - The channel's buffer is at capacity - The backpressure strategy is set to 'error' - A new value cannot be buffered Use this error to implement load shedding - rejecting new work when the system is at capacity rather than blocking or dropping data. #__PURE__

**Examples:**

```typescript
import { scope, ChannelFullError } from 'go-go-scope'

await using s = scope()

// Create a channel with error backpressure
const ch = s.channel<number>(1, { backpressure: 'error' })

await ch.send(1) // succeeds, buffer now has 1 item

try {
  await ch.send(2) // throws ChannelFullError (capacity exceeded)
} catch (err) {
  if (err instanceof ChannelFullError) {
    console.log('Channel buffer is full - implement load shedding')
    // Handle the backpressure (e.g., return 503 Service Unavailable)
  }
}
```

```typescript
// Implementing a load-shedding API endpoint
import { scope, ChannelFullError } from 'go-go-scope'

const requestChannel = scope().channel<Request>(100, {
  backpressure: 'error'
})

async function handleApiRequest(req: Request) {
  try {
    await requestChannel.send(req)
    return { status: 202, body: 'Accepted' }
  } catch (err) {
    if (err instanceof ChannelFullError) {
      return { status: 503, body: 'Service Unavailable - try again later' }
    }
    throw err
  }
}
```

*Source: [errors.ts:194](packages/go-go-scope/src/errors.ts#L194)*

---

### ScopedEventEmitter

```typescript
class ScopedEventEmitter<Events extends EventMap = EventMap>
```

Scoped EventEmitter with automatic cleanup All listeners are automatically removed when the parent scope is disposed.

*Source: [event-emitter.ts:45](packages/go-go-scope/src/event-emitter.ts#L45)*

---

### EnhancedGracefulShutdownController

```typescript
class EnhancedGracefulShutdownController
```

Enhanced graceful shutdown controller with strategies

*Source: [graceful-shutdown-enhanced.ts:59](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L59)*

---

### ShutdownCoordinator

```typescript
class ShutdownCoordinator
```

Shutdown coordinator for multi-scope applications

*Source: [graceful-shutdown-enhanced.ts:365](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L365)*

---

### ProcessLifecycle

```typescript
class ProcessLifecycle
```

Process lifecycle manager with graceful shutdown

*Source: [graceful-shutdown-enhanced.ts:485](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L485)*

---

### GracefulShutdownController

```typescript
class GracefulShutdownController
```

Graceful shutdown controller. Automatically handles shutdown signals and coordinates cleanup with the scope lifecycle. When a shutdown signal is received: 1. The onShutdown callback is invoked 2. The scope is aborted (cancelling ongoing tasks) 3. The scope is disposed (cleaning up resources) 4. The onComplete callback is invoked 5. The process exits (if configured) Tasks can check `scope.shutdownRequested` to cooperatively shut down.

**Examples:**

```typescript
import { scope } from "go-go-scope";

await using s = scope()

const shutdown = setupGracefulShutdown(s, {
  timeout: 30000,
  onShutdown: async (signal) => {
    console.log(`Received ${signal}, shutting down...`)
  },
  onComplete: async () => {
    console.log('Cleanup complete');
  }
})

// In your tasks, check for shutdown
s.task(async ({ signal }) => {
  while (!signal.aborted) {
    await process()
  }
})

// Or check the controller directly
s.task(async () => {
  while (!shutdown.isShutdownRequested) {
    await process()
  }
})

// Wait for shutdown to complete
await shutdown.shutdownComplete;
```

**@see:** {@link GracefulShutdownOptions} Configuration options

*Source: [graceful-shutdown.ts:121](packages/go-go-scope/src/graceful-shutdown.ts#L121)*

---

### InMemoryIdempotencyProvider

```typescript
class InMemoryIdempotencyProvider
```

In-memory idempotency provider for testing and development. Stores idempotency results in memory. All data is lost when the process exits. Uses {@link InMemoryCache} internally for consistent caching behavior with LRU eviction and TTL support. **Note:** This provider does not persist across process restarts. For production use, use a distributed provider like Redis from

**Examples:**

```typescript
import { scope, InMemoryIdempotencyProvider } from "go-go-scope";

// Create provider with max 1000 entries
const provider = new InMemoryIdempotencyProvider({ maxSize: 1000 });

await using s = scope({
  persistence: { idempotency: provider }
});

// Use in tasks - first execution is cached
const [r1] = await s.task(() => computeExpensiveResult(), {
  idempotency: { key: "computation:123", ttl: 60000 }
});

// Second execution returns cached result
const [r2] = await s.task(() => computeExpensiveResult(), {
  idempotency: { key: "computation:123", ttl: 60000 }
});
// r1 === r2

// Check provider stats
console.log(`Cached entries: ${provider.size}`);

// Clean up expired entries
const cleaned = provider.cleanup();
console.log(`Removed ${cleaned} expired entries`);

// Clear all entries
await provider.clear();
```

**@go-go-scope:** /persistence-redis.

**@implements:** *

*Source: [idempotency.ts:144](packages/go-go-scope/src/idempotency.ts#L144)*

---

### LockGuard

```typescript
class LockGuard
```

A lock guard that releases the lock when disposed. This class implements both `Disposable` and `AsyncDisposable` for use with the `using` and `await using` statements. The lock is automatically released when the guard goes out of scope.

**Examples:**

```typescript
const lock = new Lock(s.signal);

// Automatic release with await using
await using guard = await lock.acquire();
// Lock is held here
// ... critical section ...
// Lock automatically released when guard goes out of scope

// Manual release
const guard = await lock.acquire();
try {
  // ... critical section ...
} finally {
  await guard.release();
}
```

**@implements:** *

*Source: [lock.ts:192](packages/go-go-scope/src/lock.ts#L192)*

---

### Lock

```typescript
class Lock
```

Unified Lock implementation supporting exclusive, read-write, and distributed modes. The Lock class provides a flexible locking mechanism that can operate in three modes: 1. **Exclusive/Mutex** (default): Only one holder at a time. Use {@link Lock.acquire}. 2. **Read-Write**: Multiple readers OR one writer. Use {@link Lock.read} and {@link Lock.write}. 3. **Distributed**: Uses persistence provider for cross-process locking.

**Examples:**

```typescript
import { scope, Lock } from "go-go-scope";
import { RedisAdapter } from "@go-go-scope/persistence-redis";

await using s = scope();

// Exclusive lock (mutex)
const mutex = new Lock(s.signal);
await using guard = await mutex.acquire();

// Read-write lock
const rwlock = new Lock(s.signal, { allowMultipleReaders: true });

// Multiple readers allowed
await using readGuard1 = await rwlock.read();
await using readGuard2 = await rwlock.read();

// Exclusive writer - waits for all readers
await using writeGuard = await rwlock.write();

// Distributed lock with Redis
const distLock = new Lock(s.signal, {
  provider: new RedisAdapter(redis),
  key: "resource:123",
  ttl: 30000
});
await using guard = await distLock.acquire({ timeout: 5000 });
```

**@implements:** *

*Source: [lock.ts:341](packages/go-go-scope/src/lock.ts#L341)*

---

### CorrelatedLogger

```typescript
class CorrelatedLogger
```

Logger that automatically includes correlation IDs. Wraps a delegate logger and prepends correlation context to all log messages, enabling distributed tracing. When no additional arguments are provided, the correlation context is logged as a structured object. When arguments are provided, they are passed through with the formatted message.

**Examples:**

```typescript
import { CorrelatedLogger, CorrelationContext, ConsoleLogger } from "go-go-scope";

const delegate = new ConsoleLogger("my-service", "debug");

const correlation: CorrelationContext = {
  traceId: "abc123def456...",
  spanId: "xyz789...",
  scopeName: "api-request"
};

const logger = new CorrelatedLogger(delegate, correlation);

// Simple message - correlation added as structured object
logger.info("Processing request");
// Output: [traceId=abc123...] [spanId=xyz789...] Processing request { traceId: "abc123...", spanId: "xyz789...", scopeName: "api-request" }

// Message with arguments - correlation in message only
logger.info("User action", { userId: 123, action: "login" });
// Output: [traceId=abc123...] [spanId=xyz789...] User action { userId: 123, action: "login" }
```

```typescript
// Using with scope
import { scope } from "go-go-scope";

await using s = scope({
  name: "payment-service",
  logCorrelation: true
});

// Logger automatically includes correlation IDs
s.task(async ({ logger }) => {
  logger.info("Processing payment");
  // Logs include traceId and spanId automatically
});
```

*Source: [log-correlation.ts:207](packages/go-go-scope/src/log-correlation.ts#L207)*

---

### ConsoleLogger

```typescript
class ConsoleLogger
```

Default console logger implementation. Uses console methods with scope prefix and configurable log levels. Supports four log levels: debug, info, warn, error. Messages at or above the configured level are output to the console. #__PURE__

**Examples:**

```typescript
import { ConsoleLogger } from 'go-go-scope';

// Create a logger with info level (default)
const logger = new ConsoleLogger('api-server', 'info');

logger.info('Server started'); // Output: [api-server] Server started
logger.debug('Debug info');    // Not output (below info level)

// Create with debug level
const debugLogger = new ConsoleLogger('worker', 'debug');
debugLogger.debug('Processing item', { id: 123 }); // Output: [worker] Processing item { id: 123 }
```

*Source: [logger.ts:52](packages/go-go-scope/src/logger.ts#L52)*

---

### NoOpLogger

```typescript
class NoOpLogger
```

No-op logger for when logging is disabled. All logging methods do nothing, providing zero-overhead logging in performance-critical paths or production environments where logging is not needed. #__PURE__

**Examples:**

```typescript
import { scope, NoOpLogger } from 'go-go-scope';

// Disable logging entirely for maximum performance
await using s = scope({
  name: 'high-perf-worker',
  logger: new NoOpLogger()
});

// All logger calls are no-ops
const [err, result] = await s.task(async ({ logger }) => {
  logger.info('This is not logged');
  logger.error('Neither is this');
  return computeIntensiveResult();
});
```

*Source: [logger.ts:155](packages/go-go-scope/src/logger.ts#L155)*

---

### MemoryMonitor

```typescript
class MemoryMonitor
```

Memory monitor that tracks heap usage and triggers callbacks on pressure

*Source: [memory-monitor.ts:145](packages/go-go-scope/src/memory-monitor.ts#L145)*

---

### PerformanceMonitor

```typescript
class PerformanceMonitor
```

Performance monitor for a scope

*Source: [performance.ts:59](packages/go-go-scope/src/performance.ts#L59)*

---

### MemoryTracker

```typescript
class MemoryTracker
```

Memory tracker for detecting leaks

*Source: [performance.ts:415](packages/go-go-scope/src/performance.ts#L415)*

---

### PriorityChannel

```typescript
class PriorityChannel<T>
```

A Priority Channel for concurrent communication with priority ordering. Unlike regular channels that use FIFO ordering, priority channels deliver items based on priority as determined by a comparator function. Items are stored in a binary heap for efficient O(log n) insertions and extractions. The highest priority item (as determined by the comparator) is always delivered first. #__PURE__

**Examples:**

```typescript
await using s = scope()

// Create a priority channel with numeric priorities (lower = higher priority)
const pq = s.priorityChannel<Task>({
  capacity: 100,
  comparator: (a, b) => a.priority - b.priority
})

// Send tasks with priorities
await pq.send({ value: task1, priority: 3 })
await pq.send({ value: task2, priority: 1 })  // Higher priority
await pq.send({ value: task3, priority: 2 })

// Receive in priority order: task2, task3, task1
const item = await pq.receive() // task2
```

**@template:** The type of items in the channel

**@implements:** For automatic cleanup with `await using`

**@see:** {@link PriorityComparator} Comparator function type

*Source: [priority-channel.ts:304](packages/go-go-scope/src/priority-channel.ts#L304)*

---

### ResourcePool

```typescript
class ResourcePool<T>
```

A managed pool of resources with automatic lifecycle management. Useful for connection pooling (databases, HTTP clients, etc.) and any scenario where creating resources is expensive and reusing them improves performance. The pool maintains a minimum number of resources (warming) and scales up to a maximum under load. Resources can be health-checked periodically and unhealthy resources are automatically replaced. #__PURE__

**Examples:**

```typescript
await using s = scope()

const pool = s.resourcePool({
  create: () => createDatabaseConnection(),
  destroy: (conn) => conn.close(),
  healthCheck: async (conn) => {
    try {
      await conn.query('SELECT 1')
      return { healthy: true }
    } catch {
      return { healthy: false, message: 'Connection failed health check' }
    }
  },
  healthCheckInterval: 30000, // Check every 30s
  min: 2,
  max: 10,
  acquireTimeout: 5000
})

// Acquire a resource
const conn = await pool.acquire()
try {
  await conn.query('SELECT 1')
} finally {
  await pool.release(conn)
}
```

**@template:** The type of resource being pooled

**@implements:** *

**@see:** {@link HealthCheckResult} Health check return type

*Source: [resource-pool.ts:145](packages/go-go-scope/src/resource-pool.ts#L145)*

---

### AsyncDisposableResource

```typescript
class AsyncDisposableResource<T>
```

Async disposable resource wrapper

*Source: [scope.ts:99](packages/go-go-scope/src/scope.ts#L99)*

---

### Scope

```typescript
class Scope<Services extends Record<string, unknown> = Record<string, never>>
```

A Scope for structured concurrency. // @ts-expect-error TypeScript may not recognize Symbol.asyncDispose in all configurations

*Source: [scope.ts:260](packages/go-go-scope/src/scope.ts#L260)*

---

### Semaphore

```typescript
class Semaphore
```

A Semaphore for limiting concurrent access to a resource. Respects scope cancellation and supports priority-based acquisition. #__PURE__

**@see:** (module-level documentation for detailed examples)

*Source: [semaphore.ts:75](packages/go-go-scope/src/semaphore.ts#L75)*

---

### SharedWorkerModule

```typescript
class SharedWorkerModule
```

A shared worker module that can be used across multiple scopes. The module is imported once and cached, reducing overhead when used frequently across different scopes.

**Examples:**

```typescript
// Create once at application startup
const mathWorker = await createSharedWorker('./math-lib.js', { validate: true });

// Use in multiple scopes
await using s1 = scope();
const [err1, result1] = await s1.task(
  mathWorker.export('fibonacci'),
  { worker: true, data: { n: 40 } }
);

await using s2 = scope();
const [err2, result2] = await s2.task(
  mathWorker.export('factorial'),
  { worker: true, data: { n: 100 } }
);
```

*Source: [shared-worker.ts:40](packages/go-go-scope/src/shared-worker.ts#L40)*

---

### Task

```typescript
class Task<T>
```

A disposable task that runs within a Scope. Task implements `PromiseLike` for await support and `Disposable` for cleanup via the `using` syntax. Execution is lazy - the task only starts when awaited or `.then()` is called. This enables efficient task composition without creating unnecessary promises. Key features: - Lazy execution - only starts when consumed - Automatic cancellation propagation from parent scope - Disposable cleanup via `Symbol.dispose` - Promise-like interface with `then`, `catch`, `finally` - Unique task ID for debugging and tracing Optimizations: - Lazy AbortController creation (only when needed) - Reduced memory allocations in hot paths - Efficient parent signal linking #__PURE__

**Examples:**

```typescript
import { scope } from 'go-go-scope';

await using s = scope();

// Create a task (doesn't execute yet)
const task = s.task(async ({ signal }) => {
  const response = await fetch('/api/data', { signal });
  return response.json();
});

// Task starts executing when awaited
const [err, data] = await task;
if (!err) {
  console.log('Data:', data);
}
```

```typescript
// Task with cancellation propagation
await using s = scope();

const task = s.task(async ({ signal }) => {
  // Listen for cancellation
  signal.addEventListener('abort', () => {
    console.log('Task cancelled');
  });

  try {
    await longRunningOperation({ signal });
  } catch (e) {
    if (signal.aborted) {
      console.log('Operation was aborted');
    }
    throw e;
  }
});

// If scope is disposed, task receives abort signal
await s[Symbol.asyncDispose]();
```

```typescript
// Manual task disposal (without execution)
await using s = scope();

{
  using task = s.task(() => fetchData());

  // Task not executed, just disposed
  // Parent signal listener cleaned up
}

// Task resources cleaned up without ever running
```

```typescript
// Promise-like interface
await using s = scope();

const task = s.task(() => computeValue());

// Use .then(), .catch(), .finally() like a regular promise
const result = await task
  .then(([err, value]) => {
    if (err) throw err;
    return value;
  })
  .catch(error => {
    console.error('Failed:', error);
    return defaultValue;
  })
  .finally(() => {
    console.log('Task completed');
  });
```

```typescript
// Check task state before execution
await using s = scope();

const task = s.task(() => fetchData());

console.log(task.isStarted); // false - not yet executed
console.log(task.isSettled); // false - not completed
console.log(task.id); // unique task identifier

await task;

console.log(task.isStarted); // true
console.log(task.isSettled); // true
```

**@typeParam:** T - The type of the value the task will resolve with

**@see:** {@link Scope} - For structured concurrency context

*Source: [task.ts:156](packages/go-go-scope/src/task.ts#L156)*

---

### TokenBucket

```typescript
class TokenBucket
```

A token bucket rate limiter. Use for rate limiting API calls, requests, or any operation that needs to be limited to a certain rate over time. The token bucket allows bursts up to capacity while maintaining a steady refill rate. Supports both local (in-memory) and distributed (via persistence) modes. In distributed mode, the token state is stored in a cache provider (e.g., Redis) allowing rate limiting across multiple processes.

**Examples:**

```typescript
await using s = scope()

// Local rate limiter: 100 requests per second
const bucket = s.tokenBucket({
  capacity: 100,
  refillRate: 100
})

// Use the bucket
await bucket.acquire(async () => {
  await makeApiCall()
})

// Check if allowed without consuming
if (bucket.tryConsume(1)) {
  await makeApiCall()
}
```

**@see:** {@link TokenBucketOptions} Configuration options

*Source: [token-bucket.ts:113](packages/go-go-scope/src/token-bucket.ts#L113)*

---

### WorkerPool

```typescript
class WorkerPool
```

A pool of worker threads for executing CPU-intensive tasks. Implements AsyncDisposable for structured concurrency.

**Examples:**

```typescript
await using pool = new WorkerPool({ size: 4 });

const result = await pool.execute(
  (n) => fibonacci(n),
  40
);
```

*Source: [worker-pool.ts:129](packages/go-go-scope/src/worker-pool.ts#L129)*

---

## Interfaces

### AsyncIteratorFromOptions

```typescript
interface AsyncIteratorFromOptions
```

Async iterator helpers for go-go-scope Provides utilities for working with async iterables Options for async iterable operations

*Source: [async-iterable.ts:10](packages/go-go-scope/src/async-iterable.ts#L10)*

---

### FromArrayOptions

```typescript
interface FromArrayOptions
```

Options for fromArray

*Source: [async-iterable.ts:18](packages/go-go-scope/src/async-iterable.ts#L18)*

---

### BatchOptions

```typescript
interface BatchOptions
```

Options for batch processing

*Source: [batch.ts:11](packages/go-go-scope/src/batch.ts#L11)*

---

### EnhancedGracefulShutdownOptions

```typescript
interface EnhancedGracefulShutdownOptions
```

Enhanced graceful shutdown options

*Source: [graceful-shutdown-enhanced.ts:25](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L25)*

---

### GracefulShutdownOptions

```typescript
interface GracefulShutdownOptions
```

Options for graceful shutdown configuration.

**Examples:**

```typescript
const options: GracefulShutdownOptions = {
  signals: ['SIGTERM', 'SIGINT'],
  timeout: 30000,
  onShutdown: async (signal) => {
    console.log(`Received ${signal}, starting shutdown...`);
  },
  onComplete: async () => {
    console.log('Shutdown complete');
  },
  exit: true,
  successExitCode: 0,
  timeoutExitCode: 1
};
```

**@interface:** 

**@see:** {@link setupGracefulShutdown} Factory function accepting these options

*Source: [graceful-shutdown.ts:53](packages/go-go-scope/src/graceful-shutdown.ts#L53)*

---

### InMemoryIdempotencyProviderOptions

```typescript
interface InMemoryIdempotencyProviderOptions
```

Configuration options for {@link InMemoryIdempotencyProvider}.

*Source: [idempotency.ts:74](packages/go-go-scope/src/idempotency.ts#L74)*

---

### LockOptions

```typescript
interface LockOptions
```

Configuration options for creating a {@link Lock} instance. These options determine whether the lock operates in exclusive mode, read-write mode, or distributed mode.

*Source: [lock.ts:55](packages/go-go-scope/src/lock.ts#L55)*

---

### LockAcquireOptions

```typescript
interface LockAcquireOptions
```

Options for acquiring a lock.

*Source: [lock.ts:134](packages/go-go-scope/src/lock.ts#L134)*

---

### CorrelationContext

```typescript
interface CorrelationContext
```

Correlation context for logging. Contains identifiers that link related operations together across async boundaries and service calls.

**Examples:**

```typescript
import { CorrelationContext } from "go-go-scope";

const context: CorrelationContext = {
  traceId: "abc123...",
  spanId: "xyz789...",
  parentSpanId: "parent456...",
  scopeName: "user-service"
};

// Propagate context to child operations
async function childOperation(parentContext: CorrelationContext) {
  const childContext: CorrelationContext = {
    traceId: parentContext.traceId,  // Same trace
    spanId: generateSpanId(),         // New span
    parentSpanId: parentContext.spanId,
    scopeName: "database-query"
  };
  // ... use childContext for logging
}
```

*Source: [log-correlation.ts:147](packages/go-go-scope/src/log-correlation.ts#L147)*

---

### MemoryUsage

```typescript
interface MemoryUsage
```

Memory usage information

*Source: [memory-monitor.ts:27](packages/go-go-scope/src/memory-monitor.ts#L27)*

---

### MemoryLimitConfig

```typescript
interface MemoryLimitConfig
```

Memory limit configuration

*Source: [memory-monitor.ts:43](packages/go-go-scope/src/memory-monitor.ts#L43)*

---

### ParallelOptions

```typescript
interface ParallelOptions
```

Options for configuring parallel execution behavior.

**Examples:**

```typescript
const options = {
  concurrency: 3,           // Run max 3 tasks at once
  continueOnError: true,    // Continue even if some tasks fail
  onProgress: (completed, total, result) => {
    console.log(`${completed}/${total} done`);
  }
};
```

*Source: [parallel.ts:30](packages/go-go-scope/src/parallel.ts#L30)*

---

### PerformanceMetrics

```typescript
interface PerformanceMetrics
```

Performance metrics for a scope

*Source: [performance.ts:10](packages/go-go-scope/src/performance.ts#L10)*

---

### PerformanceSnapshot

```typescript
interface PerformanceSnapshot
```

Performance snapshot for tracking over time

*Source: [performance.ts:39](packages/go-go-scope/src/performance.ts#L39)*

---

### PerformanceMonitorOptions

```typescript
interface PerformanceMonitorOptions
```

Configuration for performance monitoring

*Source: [performance.ts:47](packages/go-go-scope/src/performance.ts#L47)*

---

### BenchmarkOptions

```typescript
interface BenchmarkOptions
```

Benchmark runner for performance testing

*Source: [performance.ts:238](packages/go-go-scope/src/performance.ts#L238)*

---

### BenchmarkResult

```typescript
interface BenchmarkResult
```

Results from a benchmark execution. Contains timing statistics and performance metrics from running a function multiple times to measure its performance characteristics.

**Examples:**

```typescript
const result = await benchmark('my-function', () => {
  // Function to benchmark
}, { iterations: 1000 });

console.log(`Average: ${result.avgDuration}ms`);
console.log(`Ops/sec: ${result.opsPerSecond}`);
```

*Source: [performance.ts:269](packages/go-go-scope/src/performance.ts#L269)*

---

### LockProvider

```typescript
interface LockProvider
```

Persistence provider interfaces for go-go-scope These interfaces allow features like distributed locks and circuit breaker state to work across multiple processes/servers. Distributed lock provider interface

*Source: [types.ts:11](packages/go-go-scope/src/persistence/types.ts#L11)*

---

### LockHandle

```typescript
interface LockHandle
```

Handle to an acquired lock

*Source: [types.ts:40](packages/go-go-scope/src/persistence/types.ts#L40)*

---

### CircuitBreakerStateProvider

```typescript
interface CircuitBreakerStateProvider
```

Circuit breaker state provider interface

*Source: [types.ts:54](packages/go-go-scope/src/persistence/types.ts#L54)*

---

### CircuitBreakerPersistedState

```typescript
interface CircuitBreakerPersistedState
```

Circuit breaker persisted state

*Source: [types.ts:96](packages/go-go-scope/src/persistence/types.ts#L96)*

---

### CacheProvider

```typescript
interface CacheProvider
```

Cache provider interface for distributed caching

*Source: [types.ts:106](packages/go-go-scope/src/persistence/types.ts#L106)*

---

### CacheStats

```typescript
interface CacheStats
```

Cache statistics for monitoring

*Source: [types.ts:151](packages/go-go-scope/src/persistence/types.ts#L151)*

---

### IdempotencyProvider

```typescript
interface IdempotencyProvider
```

Idempotency provider interface for caching task results

*Source: [types.ts:165](packages/go-go-scope/src/persistence/types.ts#L165)*

---

### Checkpoint

```typescript
interface Checkpoint
```

Checkpoint data structure

*Source: [types.ts:191](packages/go-go-scope/src/persistence/types.ts#L191)*

---

### CheckpointProvider

```typescript
interface CheckpointProvider
```

Checkpoint provider interface for persisting task progress

*Source: [types.ts:211](packages/go-go-scope/src/persistence/types.ts#L211)*

---

### PersistenceProviders

```typescript
interface PersistenceProviders
```

Combined persistence providers

*Source: [types.ts:234](packages/go-go-scope/src/persistence/types.ts#L234)*

---

### PersistenceAdapterOptions

```typescript
interface PersistenceAdapterOptions
```

Options for persistence adapter

*Source: [types.ts:250](packages/go-go-scope/src/persistence/types.ts#L250)*

---

### PersistenceAdapter

```typescript
interface PersistenceAdapter
```

Base interface for all persistence adapters

*Source: [types.ts:262](packages/go-go-scope/src/persistence/types.ts#L262)*

---

### ScopePlugin

```typescript
interface ScopePlugin
```

Plugin interface for extending Scope functionality

*Source: [plugin.ts:21](packages/go-go-scope/src/plugin.ts#L21)*

---

### PrioritizedItem

```typescript
interface PrioritizedItem
```

Priority Channel implementation for go-go-scope A channel that delivers items based on priority rather than FIFO order. Uses a binary heap for efficient O(log n) insertions and extractions. Features: - Priority-based message delivery (not FIFO) - Configurable capacity with backpressure - O(log n) insertions and extractions via binary heap - Custom comparator for flexible priority schemes - Async iterable support for `for await...of` loops - Drop-on-full capability with callback - Graceful close and cleanup // AbortSignal is a global type in modern Node.js/TypeScript Interface for items that have a priority value. This is a helper interface for common use cases where items have an explicit numeric priority. You can also use any type with a custom comparator function.

**Examples:**

```typescript
interface Task extends PrioritizedItem<string> {
  id: string;
}

const task: Task = {
  value: 'process-data',
  priority: 1,  // Lower = higher priority
  id: 'task-123'
};
```

**@template:** The type of the item value

**@see:** {@link PriorityComparator} For custom comparison logic

*Source: [priority-channel.ts:50](packages/go-go-scope/src/priority-channel.ts#L50)*

---

### PriorityChannelOptions

```typescript
interface PriorityChannelOptions
```

Options for creating a priority channel.

**Examples:**

```typescript
const options: PriorityChannelOptions<Task> = {
  capacity: 100,
  comparator: (a, b) => a.priority - b.priority,
  onDrop: (task) => console.warn(`Dropped task: ${task.id}`)
};
```

**@template:** The type of items in the channel

**@see:** {@link Scope.priorityChannel} Factory on scope

*Source: [priority-channel.ts:110](packages/go-go-scope/src/priority-channel.ts#L110)*

---

### HealthCheckResult

```typescript
interface HealthCheckResult
```

Health check result for a resource. Returned by the health check function to indicate whether a resource is healthy and can continue to be used.

**Examples:**

```typescript
const healthCheck = async (connection: DatabaseConnection): Promise<HealthCheckResult> => {
  try {
    await connection.ping();
    return { healthy: true };
  } catch (error) {
    return { healthy: false, message: "Ping failed: " + String(error) };
  }
};
```

**@interface:** 

*Source: [resource-pool.ts:89](packages/go-go-scope/src/resource-pool.ts#L89)*

---

### ScopeOptions

```typescript
interface ScopeOptions
```

Options for creating a Scope

*Source: [scope.ts:134](packages/go-go-scope/src/scope.ts#L134)*

---

### SharedWorkerOptions

```typescript
interface SharedWorkerOptions
```

Options for creating a shared worker module

*Source: [shared-worker.ts:11](packages/go-go-scope/src/shared-worker.ts#L11)*

---

### TokenBucketOptions

```typescript
interface TokenBucketOptions
```

Options for creating a token bucket rate limiter.

**Examples:**

```typescript
// Local rate limiting
const options: TokenBucketOptions = {
  capacity: 100,
  refillRate: 10,  // 10 tokens per second
  initialTokens: 100
};

// Distributed rate limiting
const distributedOptions: TokenBucketOptions = {
  capacity: 1000,
  refillRate: 100,
  cache: redisCacheProvider,
  key: 'api-rate-limit:user-123'
};
```

**@interface:** 

**@see:** {@link TokenBucket} The token bucket class

*Source: [token-bucket.ts:54](packages/go-go-scope/src/token-bucket.ts#L54)*

---

### RetryStrategies

```typescript
interface RetryStrategies
```

Predefined retry delay strategies. Provides built-in implementations for common retry patterns.

**Examples:**

```typescript
import { scope, RetryStrategies } from 'go-go-scope';

await using s = scope();

// Using exponential backoff
const [err1, result1] = await s.task(
  () => fetchData(),
  { retry: 'exponential' }  // Shorthand for exponential backoff
);

// Using custom exponential backoff with jitter
const [err2, result2] = await s.task(
  () => fetchData(),
  {
    retry: {
      max: 5,
      delay: s.retryStrategies.exponentialBackoff({
        initial: 100,
        max: 10000,
        jitter: 0.3  // 30% randomization
      })
    }
  }
);
```

*Source: [types.ts:208](packages/go-go-scope/src/types.ts#L208)*

---

### CheckpointContext

```typescript
interface CheckpointContext
```

Checkpoint context passed to task functions when checkpoint is configured. Enables long-running tasks to save progress and resume after interruption.

**Examples:**

```typescript
import { scope, CheckpointContext } from 'go-go-scope';

await using s = scope({
  persistence: { checkpoint: new FileCheckpointProvider('./checkpoints') }
});

const [err, result] = await s.task(
  async ({ checkpoint }: { checkpoint?: CheckpointContext<{ processed: number }> }) => {
    const data = await loadLargeDataset();
    let processed = checkpoint?.data?.processed ?? 0;

    for (let i = processed; i < data.length; i++) {
      await processItem(data[i]);

      // Save progress every 100 items
      if (i % 100 === 0) {
        await checkpoint?.save({ processed: i });
      }
    }

    return { totalProcessed: data.length };
  },
  { checkpoint: { interval: 60000 } }
);
```

**@template:** - The type of checkpoint data being saved

*Source: [types.ts:300](packages/go-go-scope/src/types.ts#L300)*

---

### ProgressContext

```typescript
interface ProgressContext
```

Progress tracking context passed to task functions. Allows tasks to report their progress percentage and estimated time remaining.

**Examples:**

```typescript
import { scope, ProgressContext } from 'go-go-scope';

await using s = scope();

const [err, result] = await s.task(
  async ({ progress }: { progress?: ProgressContext }) => {
    const items = await fetchItems();

    for (let i = 0; i < items.length; i++) {
      await processItem(items[i]);

      // Update progress percentage
      progress?.update(Math.round((i / items.length) * 100));
    }

    return items.length;
  },
  { checkpoint: {} }  // Enable progress tracking
);

// Subscribe to progress updates externally
// (requires access to the progress context)
```

*Source: [types.ts:337](packages/go-go-scope/src/types.ts#L337)*

---

### TaskContext

```typescript
interface TaskContext
```

Context passed to task functions. Contains all utilities and information available within a task execution.

**Examples:**

```typescript
import { scope, TaskContext } from 'go-go-scope';

type MyServices = { db: Database; cache: Cache };

await using s = scope<MyServices>({
  services: { db: new Database(), cache: new Cache() }
});

const [err, result] = await s.task(
  async (ctx: TaskContext<MyServices>) => {
    // Access services
    const user = await ctx.services.db.findUser(1);

    // Check for cancellation
    if (ctx.signal.aborted) {
      throw new Error('Cancelled');
    }

    // Log with task context
    ctx.logger.info('Found user', { userId: user.id });

    // Access context data
    const requestId = ctx.context.requestId;

    return user;
  }
);
```

**@template:** - The type of services available from the scope

*Source: [types.ts:385](packages/go-go-scope/src/types.ts#L385)*

---

### TaskOptionsBase

```typescript
interface TaskOptionsBase
```

Base options for spawning a task with tracing (without error class options).

*Source: [types.ts:403](packages/go-go-scope/src/types.ts#L403)*

---

### TaskOptionsWithErrorClass

```typescript
interface TaskOptionsWithErrorClass
```

Options with errorClass specified - wraps ALL errors in the provided class.

*Source: [types.ts:695](packages/go-go-scope/src/types.ts#L695)*

---

### TaskOptionsWithSystemErrorClass

```typescript
interface TaskOptionsWithSystemErrorClass
```

Options with systemErrorClass specified - only wraps untagged errors.

*Source: [types.ts:734](packages/go-go-scope/src/types.ts#L734)*

---

### WorkerModuleSpec

```typescript
interface WorkerModuleSpec
```

Worker module specification for loading tasks from files. Use this instead of a function to load code from a worker file.

**Examples:**

```typescript
// Load from worker file
const [err, result] = await s.task(
  { module: './workers/compute.js', export: 'fibonacci' },
  { data: { n: 40 } }
)

// Worker file (workers/compute.js)
export function fibonacci({ data }) {
  // Full access to imports, closures, etc.
  function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }
  return fib(data.n)
}
```

**@template:** - The type of result returned from the worker

*Source: [types.ts:836](packages/go-go-scope/src/types.ts#L836)*

---

### ScopeHooks

```typescript
interface ScopeHooks
```

Lifecycle hooks for scope events. Register callbacks to be notified of scope and task lifecycle events.

**Examples:**

```typescript
import { scope, ScopeHooks } from 'go-go-scope';

const hooks: ScopeHooks = {
  beforeTask: (name, index) => {
    console.log(`Starting task ${name} (#${index})`);
  },
  afterTask: (name, duration, error, index) => {
    if (error) {
      console.error(`Task ${name} failed after ${duration}ms`);
    } else {
      console.log(`Task ${name} completed in ${duration}ms`);
    }
  },
  onCancel: (reason) => {
    console.log('Scope cancelled:', reason);
  }
};

await using s = scope({ hooks });
```

*Source: [types.ts:906](packages/go-go-scope/src/types.ts#L906)*

---

### DebounceOptions

```typescript
interface DebounceOptions
```

Options for debounce function. Controls the timing and behavior of debounced operations.

**Examples:**

```typescript
import { scope, DebounceOptions } from 'go-go-scope';

await using s = scope();

const options: DebounceOptions = {
  wait: 500,      // Wait 500ms after last call
  leading: true,  // Execute on first call
  trailing: true  // Execute after wait period
};

const debounced = s.debounce(async (query: string) => {
  return searchAPI(query);
}, options);

// Called on leading edge (immediately)
debounced('a');

// Subsequent calls reset the timer
debounced('ab');
debounced('abc'); // Only this result is used (trailing edge)
```

*Source: [types.ts:984](packages/go-go-scope/src/types.ts#L984)*

---

### ThrottleOptions

```typescript
interface ThrottleOptions
```

Options for throttle function. Controls the timing and behavior of throttled operations.

**Examples:**

```typescript
import { scope, ThrottleOptions } from 'go-go-scope';

await using s = scope();

const options: ThrottleOptions = {
  interval: 1000, // Execute at most once per second
  leading: true,  // Execute on first call
  trailing: false // Don't execute after interval
};

const throttled = s.throttle(async () => {
  return fetchUpdates();
}, options);

// Called immediately (leading edge)
throttled();

// Ignored (within interval)
throttled();
throttled();

// Called after interval passes
setTimeout(() => throttled(), 1000);
```

*Source: [types.ts:1024](packages/go-go-scope/src/types.ts#L1024)*

---

### CircuitBreakerOptions

```typescript
interface CircuitBreakerOptions
```

Options for configuring a circuit breaker in a scope. Pass these to `scope({ circuitBreaker: {...} })` to enable circuit breaking for all tasks spawned within that scope.

**Examples:**

```typescript
import { scope, CircuitBreakerOptions } from 'go-go-scope';

const options: CircuitBreakerOptions = {
  failureThreshold: 5,     // Open after 5 failures
  resetTimeout: 30000,     // Try again after 30 seconds
  successThreshold: 2,     // Require 2 successes to close
  onStateChange: (from, to, count) => {
    console.log(`Breaker: ${from} -> ${to} (failures: ${count})`);
  }
};

await using s = scope({ circuitBreaker: options });

// All tasks in this scope use the circuit breaker
const [err, result] = await s.task(() => callExternalAPI());
```

*Source: [types.ts:1082](packages/go-go-scope/src/types.ts#L1082)*

---

### RaceOptions

```typescript
interface RaceOptions
```

Options for the race function. Configures the behavior of racing multiple tasks.

**Examples:**

```typescript
import { scope, RaceOptions } from 'go-go-scope';

await using s = scope();

const options: RaceOptions = {
  requireSuccess: true,  // Only successful results count
  timeout: 5000,         // Fail if no winner in 5 seconds
  concurrency: 2,        // Run at most 2 tasks concurrently
  staggerDelay: 100      // Start tasks 100ms apart
};

const [err, winner] = await s.race([
  () => fetchFromPrimary(),
  () => fetchFromBackup(),
  () => fetchFromCache()
], options);
```

*Source: [types.ts:1162](packages/go-go-scope/src/types.ts#L1162)*

---

### PollOptions

```typescript
interface PollOptions
```

Options for the poll function. Configures polling behavior including interval and immediate execution.

**Examples:**

```typescript
import { scope, PollOptions } from 'go-go-scope';

await using s = scope();

const options: PollOptions = {
  interval: 5000,   // Poll every 5 seconds
  immediate: true,  // Run immediately on start
  signal: abortSignal  // Optional external cancellation
};

const poller = s.poll(async () => {
  const status = await checkJobStatus();
  if (status === 'complete') {
    return { done: true, value: status };
  }
  return { done: false };  // Continue polling
}, options);

// Start polling
poller.start();

// Check status
console.log(poller.status());

// Stop polling
using _ = poller;  // Auto-stop on scope disposal
```

*Source: [types.ts:1268](packages/go-go-scope/src/types.ts#L1268)*

---

### PollController

```typescript
interface PollController
```

Controller for a polling operation. Allows starting, stopping, and checking status. Automatically stops polling when disposed.

**Examples:**

```typescript
import { scope, PollController } from 'go-go-scope';

await using s = scope();

const poller: PollController = s.poll(async () => {
  const health = await checkHealth();
  return { done: !health.healthy, value: health };
}, { interval: 10000 });

// Manually control polling
poller.start();

const status = poller.status();
console.log(`Running: ${status.running}, Count: ${status.pollCount}`);

if (status.timeUntilNext > 0) {
  console.log(`Next poll in ${status.timeUntilNext}ms`);
}

poller.stop();
```

*Source: [types.ts:1306](packages/go-go-scope/src/types.ts#L1306)*

---

### SelectOptions

```typescript
interface SelectOptions
```

Options for select() with timeout support. Controls the behavior of the select statement for channel operations.

**Examples:**

```typescript
import { scope, SelectOptions } from 'go-go-scope';

await using s = scope();

const ch1 = s.channel<string>();
const ch2 = s.channel<number>();

const options: SelectOptions = {
  timeout: 5000  // Fail if no case is ready within 5 seconds
};

const result = await s.select([
  { case: ch1.receive(), fn: (msg) => ({ type: 'string', value: msg }) },
  { case: ch2.receive(), fn: (num) => ({ type: 'number', value: num }) }
], options);

if (result) {
  console.log('Received:', result);
} else {
  console.log('Timeout - no channel ready');
}
```

*Source: [types.ts:1355](packages/go-go-scope/src/types.ts#L1355)*

---

### Logger

```typescript
interface Logger
```

Logger interface for structured logging integration. Implement this interface to provide custom logging backends.

**Examples:**

```typescript
import { Logger } from 'go-go-scope';

// Custom logger implementation for Winston
class WinstonLogger implements Logger {
  constructor(private winston: WinstonLogger) {}

  debug(message: string, ...args: unknown[]): void {
    this.winston.debug(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.winston.info(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.winston.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.winston.error(message, ...args);
  }
}

// Use with scope
await using s = scope({
  name: 'my-service',
  logger: new WinstonLogger(winston)
});
```

*Source: [types.ts:1396](packages/go-go-scope/src/types.ts#L1396)*

---

### ScopeLoggingOptions

```typescript
interface ScopeLoggingOptions
```

Options for scope with logging. Configures logging behavior when creating a scope.

**Examples:**

```typescript
import { scope, ScopeLoggingOptions, ConsoleLogger } from 'go-go-scope';

const options: ScopeLoggingOptions = {
  logger: new ConsoleLogger('my-app', 'debug'),
  logLevel: 'debug'
};

await using s = scope({
  name: 'worker',
  ...options
});
```

*Source: [types.ts:1446](packages/go-go-scope/src/types.ts#L1446)*

---

### DisposableScope

```typescript
interface DisposableScope
```

Minimal scope interface for rate limiting functions. Used to avoid circular dependencies.

**Examples:**

```typescript
import { DisposableScope } from 'go-go-scope';

function createRateLimiter(scope: DisposableScope) {
  return {
    async acquire() {
      if (scope.isDisposed) {
        throw new Error('Scope is disposed');
      }
      if (scope.signal.aborted) {
        throw new Error('Scope is aborted');
      }
      // Acquire rate limit token
    }
  };
}
```

*Source: [types.ts:1476](packages/go-go-scope/src/types.ts#L1476)*

---

### ResourcePoolOptions

```typescript
interface ResourcePoolOptions
```

Resource pool configuration. Options for creating and managing a pool of reusable resources.

**Examples:**

```typescript
import { scope, ResourcePoolOptions } from 'go-go-scope';

type DatabaseConnection = { query: (sql: string) => Promise<unknown[]> };

const options: ResourcePoolOptions<DatabaseConnection> = {
  create: async () => {
    return createConnection({ host: 'localhost', port: 5432 });
  },
  destroy: async (conn) => {
    await conn.close();
  },
  min: 2,              // Keep at least 2 connections ready
  max: 10,             // Maximum 10 connections
  acquireTimeout: 5000, // Wait up to 5 seconds for a connection
  healthCheck: async (conn) => {
    try {
      await conn.query('SELECT 1');
      return { healthy: true };
    } catch (e) {
      return { healthy: false, message: String(e) };
    }
  },
  healthCheckInterval: 30000  // Check health every 30 seconds
};

await using s = scope();
const pool = s.resourcePool(options);

await using conn = await pool.acquire();
const results = await conn.query('SELECT * FROM users');
```

**@template:** - The type of resource being pooled

*Source: [types.ts:1525](packages/go-go-scope/src/types.ts#L1525)*

---

### ChannelOptions

```typescript
interface ChannelOptions
```

Options for creating a Channel. Configures buffer capacity, backpressure behavior, and callbacks.

**Examples:**

```typescript
import { scope, ChannelOptions } from 'go-go-scope';

await using s = scope();

// Buffered channel with drop-oldest strategy
const options: ChannelOptions<number> = {
  capacity: 100,
  backpressure: 'drop-oldest',
  onDrop: (value) => {
    metrics.increment('channel.dropped');
    console.warn(`Dropped value: ${value}`);
  }
};

const ch = s.channel<number>(options);

// Sample strategy for high-frequency data
const sampledCh = s.channel<SensorReading>({
  capacity: 10,
  backpressure: 'sample',
  sampleWindow: 1000  // Keep only one value per second
});
```

**@template:** - The type of values passing through the channel

*Source: [types.ts:1682](packages/go-go-scope/src/types.ts#L1682)*

---

### WorkerPoolOptions

```typescript
interface WorkerPoolOptions
```

Options for creating a WorkerPool

*Source: [worker-pool.ts:50](packages/go-go-scope/src/worker-pool.ts#L50)*

---

### WorkerMessage

```typescript
interface WorkerMessage
```

Message types for worker communication

*Source: [worker-pool.ts:67](packages/go-go-scope/src/worker-pool.ts#L67)*

---

### PooledWorker

```typescript
interface PooledWorker
```

Internal worker state

*Source: [worker-pool.ts:80](packages/go-go-scope/src/worker-pool.ts#L80)*

---

### PendingTask

```typescript
interface PendingTask
```

Task pending execution

*Source: [worker-pool.ts:90](packages/go-go-scope/src/worker-pool.ts#L90)*

---

### PendingModuleTask

```typescript
interface PendingModuleTask
```

Module task pending execution

*Source: [worker-pool.ts:102](packages/go-go-scope/src/worker-pool.ts#L102)*

---

## Types

### EventHandler

```typescript
type EventHandler = (...args: unknown[]) => void
```

Event handler type for circuit breaker events.

**@param:** - Variable arguments depending on the event type

*Source: [circuit-breaker.ts:12](packages/go-go-scope/src/circuit-breaker.ts#L12)*

---

### CircuitBreakerEvent

```typescript
type CircuitBreakerEvent = | "stateChange"
	| "open"
	| "close"
	| "halfOpen"
	| "success"
	| "failure"
	| "thresholdAdapt"
```

Circuit breaker event types. Available events: - **'stateChange'**: Emitted when the circuit state changes (fromState, toState, failureCount) - **'open'**: Emitted when the circuit opens (failureCount) - **'close'**: Emitted when the circuit closes - **'halfOpen'**: Emitted when the circuit enters half-open state - **'success'**: Emitted when a protected call succeeds - **'failure'**: Emitted when a protected call fails - **'thresholdAdapt'**: Emitted when adaptive threshold changes (newThreshold, errorRate)

*Source: [circuit-breaker.ts:26](packages/go-go-scope/src/circuit-breaker.ts#L26)*

---

### EventHandler

```typescript
type EventHandler = (...args: unknown[]) => void
```

Type for event handler functions

*Source: [event-emitter.ts:33](packages/go-go-scope/src/event-emitter.ts#L33)*

---

### EventMap

```typescript
type EventMap = Record<string, EventHandler>
```

Event map with typed handlers

*Source: [event-emitter.ts:38](packages/go-go-scope/src/event-emitter.ts#L38)*

---

### ShutdownStrategy

```typescript
type ShutdownStrategy = "immediate" | "drain" | "timeout" | "hybrid"
```

Shutdown strategy

*Source: [graceful-shutdown-enhanced.ts:20](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L20)*

---

### ShutdownState

```typescript
type ShutdownState = | "running"
	| "shutting-down"
	| "draining"
	| "cleaning-up"
	| "complete"
	| "failed"
```

Shutdown state

*Source: [graceful-shutdown-enhanced.ts:48](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L48)*

---

### WithPlugins

```typescript
type WithPlugins = T & {
	[K in Plugins[number] as K extends {
		name: infer N extends string;
	}
		? N extends `${infer First}${string}`
			? First extends string
				? K extends { methods: infer M }
					? keyof M extends never
						? never
						: N
					: never
				: never
			: never
		: never]: K extends { methods: infer M } ? M : never;
}
```

Type helper to extract plugin-added methods

*Source: [plugin.ts:91](packages/go-go-scope/src/plugin.ts#L91)*

---

### PriorityComparator

```typescript
type PriorityComparator = (a: T, b: T) => number
```

Comparator function for determining priority order. Return negative if a < b (a has higher priority), 0 if equal priority, positive if a > b (b has higher priority). For numeric priorities, simply subtract: `(a, b) => a.priority - b.priority`

**Examples:**

```typescript
// Numeric priority (lower = higher priority)
const numericComparator: PriorityComparator<Task> = (a, b) => a.priority - b.priority;

// Reverse priority (higher = higher priority)
const reverseComparator: PriorityComparator<Task> = (a, b) => b.priority - a.priority;

// Complex multi-field sorting
const complexComparator: PriorityComparator<Job> = (a, b) => {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  // Secondary sort by deadline
  return a.deadline - b.deadline;
};
```

**@template:** The type of items being compared

**@param:** - Second item to compare

**@returns:** Negative if a < b, 0 if equal, positive if a > b

**@see:** {@link PriorityChannelOptions.comparator} Where this is used

*Source: [priority-channel.ts:91](packages/go-go-scope/src/priority-channel.ts#L91)*

---

### Success

```typescript
type Success = readonly [undefined, T]
```

Type definitions and interfaces for go-go-scope Provides core types for structured concurrency including Result tuples, task options, scope configuration, and various utility types for error handling, retry strategies, and resource management. Represents a successful Result tuple with a value and no error. The first element is undefined (no error), the second is the success value.

**Examples:**

```typescript
import { Success } from 'go-go-scope';

function divide(a: number, b: number): Success<number> | Failure<Error> {
  if (b === 0) {
    return [new Error('Division by zero'), undefined];
  }
  return [undefined, a / b];
}

const [err, result] = divide(10, 2);
if (!err) {
  console.log(result); // 5
}
```

**@template:** - The type of the success value

*Source: [types.ts:32](packages/go-go-scope/src/types.ts#L32)*

---

### Failure

```typescript
type Failure = readonly [E, undefined]
```

Represents a failed Result tuple with an error and no value. The first element is the error, the second is undefined (no value).

**Examples:**

```typescript
import { Failure } from 'go-go-scope';

function parseJSON(json: string): Success<object> | Failure<Error> {
  try {
    return [undefined, JSON.parse(json)];
  } catch (e) {
    return [e as Error, undefined];
  }
}

const [err, data] = parseJSON('invalid json');
if (err) {
  console.error('Parse failed:', err.message);
}
```

**@template:** - The type of the error

*Source: [types.ts:58](packages/go-go-scope/src/types.ts#L58)*

---

### Result

```typescript
type Result = Success<T> | Failure<E>
```

Represents a Result tuple that can be either success or failure. Follows the pattern [error, value] where exactly one is defined.

**Examples:**

```typescript
import { Result } from 'go-go-scope';

async function fetchUser(id: string): Promise<Result<Error, User>> {
  try {
    const user = await db.users.findById(id);
    return [undefined, user];
  } catch (error) {
    return [error as Error, undefined];
  }
}

// Using with go-go-scope tasks
await using s = scope();

const [err, user] = await s.task(() => fetchUser('123'));
if (err) {
  console.error('Failed to fetch user:', err);
} else {
  console.log('User:', user.name);
}
```

**@template:** - The type of the success value

*Source: [types.ts:91](packages/go-go-scope/src/types.ts#L91)*

---

### Transferable

```typescript
type Transferable = ArrayBuffer
```

Transferable type for zero-copy data transfer to workers. In Node.js, this includes ArrayBuffer and MessagePort. Used when passing data to worker threads to enable efficient memory transfer without copying.

**Examples:**

```typescript
import { scope } from 'go-go-scope';

const buffer = new ArrayBuffer(1024 * 1024); // 1MB

await using s = scope();
const [err, result] = await s.task(
  ({ data }) => {
    // Process in worker thread with zero-copy transfer
    const view = new Uint8Array(data.buffer);
    return view.reduce((a, b) => a + b, 0);
  },
  {
    worker: true,
    data: { buffer } // ArrayBuffer is transferred, not copied
  }
);
```

*Source: [types.ts:120](packages/go-go-scope/src/types.ts#L120)*

---

### ErrorConstructor

```typescript
type ErrorConstructor = new (
	message: string,
	options?: { cause?: unknown },
) => E
```

Error class constructor type for typed error handling. Used to specify which error class should wrap task errors.

**Examples:**

```typescript
import { ErrorConstructor } from 'go-go-scope';

class DatabaseError extends Error {
  readonly _tag = 'DatabaseError' as const;
}

// Use as a constructor type
function createError(
  ErrorClass: ErrorConstructor<DatabaseError>,
  message: string
): DatabaseError {
  return new ErrorClass(message);
}
```

**@template:** - The error type the constructor creates

*Source: [types.ts:145](packages/go-go-scope/src/types.ts#L145)*

---

### RetryDelayFn

```typescript
type RetryDelayFn = (attempt: number, error: unknown) => number
```

Retry delay function type. Called for each retry attempt to determine how long to wait.

**Examples:**

```typescript
import { RetryDelayFn } from 'go-go-scope';

const customDelay: RetryDelayFn = (attempt, error) => {
  // Exponential backoff with base 100ms
  return Math.min(100 * Math.pow(2, attempt - 1), 5000);
};

await using s = scope();
const [err, result] = await s.task(
  () => fetchData(),
  { retry: { max: 3, delay: customDelay } }
);
```

**@param:** - The error that caused the retry

**@returns:** The delay in milliseconds before the next attempt

*Source: [types.ts:174](packages/go-go-scope/src/types.ts#L174)*

---

### TaskOptions

```typescript
type TaskOptions = | TaskOptionsWithErrorClass<E>
	| TaskOptionsWithSystemErrorClass<E>
	| TaskOptionsBase
```

Options for spawning a task with tracing. errorClass and systemErrorClass are mutually exclusive - you can only specify one, not both at the same time. When neither is specified, UnknownError is used as the default systemErrorClass (preserving tagged errors, wrapping untagged).

**Examples:**

```typescript
import { scope, TaskOptions } from 'go-go-scope';

// Basic options
const options1: TaskOptions = {
  timeout: 5000,
  retry: { max: 3, delay: 1000 }
};

// With error class
class MyError extends Error { readonly _tag = 'MyError' as const; }

const options2: TaskOptions<MyError> = {
  errorClass: MyError,
  timeout: 10000
};

await using s = scope();
const [err, result] = await s.task(() => fetchData(), options2);
// err is typed as MyError | undefined
```

**@template:** - The error type for typed error handling

*Source: [types.ts:808](packages/go-go-scope/src/types.ts#L808)*

---

### CircuitBreakerState

```typescript
type CircuitBreakerState = "closed" | "open" | "half-open"
```

Circuit breaker state type. Represents the current state of a circuit breaker. - `'closed'` - Normal operation, requests pass through - `'open'` - Failure threshold exceeded, requests fail fast - `'half-open'` - Testing if service has recovered

**Examples:**

```typescript
import { scope, CircuitBreakerState } from 'go-go-scope';

await using s = scope({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000,
    onStateChange: (from: CircuitBreakerState, to: CircuitBreakerState) => {
      console.log(`Circuit breaker: ${from} -> ${to}`);
    }
  }
});
```

*Source: [types.ts:1056](packages/go-go-scope/src/types.ts#L1056)*

---

### CircuitState

```typescript
type CircuitState = "closed" | "open" | "half-open"
```

Circuit breaker states.

**@deprecated:** Use {@link CircuitBreakerState} instead

*Source: [types.ts:1136](packages/go-go-scope/src/types.ts#L1136)*

---

### FactoryResult

```typescript
type FactoryResult = T extends (
	signal: AbortSignal,
) => Promise<infer R>
	? R
	: never
```

Helper type to extract the promise resolve type from a factory function. Extracts the return type from a task factory function.

**Examples:**

```typescript
import { FactoryResult } from 'go-go-scope';

type MyFactory = (signal: AbortSignal) => Promise<{ id: number; name: string }>;

type Result = FactoryResult<MyFactory>;
// Result is { id: number; name: string }
```

**@template:** - The factory function type

*Source: [types.ts:1570](packages/go-go-scope/src/types.ts#L1570)*

---

### ParallelResults

```typescript
type ParallelResults = {
	[K in keyof T]: Result<E, FactoryResult<T[K]>>;
}
```

Converts a tuple of factory functions to a tuple of Result types. This preserves the individual types of each factory's return value.

**Examples:**

```typescript
// With typed errors
const results = await s.parallel([
  () => fetchUser(),
  () => fetchOrders()
], { errorClass: DatabaseError })
// results is [Result<DatabaseError, User>, Result<DatabaseError, Order[]>]
```

**@template:** - Error type (defaults to unknown, can be specified for typed errors)

*Source: [types.ts:1593](packages/go-go-scope/src/types.ts#L1593)*

---

### BackpressureStrategy

```typescript
type BackpressureStrategy = | "block"
	| "drop-oldest"
	| "drop-latest"
	| "error"
	| "sample"
```

Backpressure strategy for channels. Controls behavior when the channel buffer is full. - `'block'` - Wait until space is available (default) - `'drop-oldest'` - Remove oldest item to make room for new item - `'drop-latest'` - Drop the new item when buffer is full - `'error'` - Throw error when buffer is full - `'sample'` - Keep only values within a time window (most recent)

**Examples:**

```typescript
import { scope, BackpressureStrategy } from 'go-go-scope';

await using s = scope();

// Block when full (default behavior)
const blockingCh = s.channel<number>(10, {
  backpressure: 'block' as BackpressureStrategy
});

// Drop oldest items when full
const droppingCh = s.channel<number>(10, {
  backpressure: 'drop-oldest' as BackpressureStrategy,
  onDrop: (value) => console.log(`Dropped: ${value}`)
});

// Throw error when full (for load shedding)
const errorCh = s.channel<number>(100, {
  backpressure: 'error' as BackpressureStrategy
});
```

*Source: [types.ts:1643](packages/go-go-scope/src/types.ts#L1643)*

---

## Methods

### Batch.add

```typescript
Batch.add(item: T): Promise<Result<unknown, R> | undefined>
```

Add an item to the batch. If batch reaches size limit, it auto-flushes. Returns a promise that resolves when the item is processed (if batch flushes).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `item` | `T` |  |

**Returns:** `Promise<Result<unknown, R> | undefined>`

*Source: [batch.ts:75](packages/go-go-scope/src/batch.ts#L75)*

---

### Batch.addMany

```typescript
Batch.addMany(items: T[]): Promise<Result<unknown, R>[]>
```

Add multiple items at once. May trigger multiple flushes if items exceed batch size.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `items` | `T[]` |  |

**Returns:** `Promise<Result<unknown, R>[]>`

*Source: [batch.ts:99](packages/go-go-scope/src/batch.ts#L99)*

---

### Batch.flush

```typescript
Batch.flush(): Promise<Result<unknown, R>>
```

Manually flush the current batch. Returns a Result tuple with the process result.

**Returns:** `Promise<Result<unknown, R>>`

*Source: [batch.ts:120](packages/go-go-scope/src/batch.ts#L120)*

---

### Batch.stop

```typescript
Batch.stop(): Promise<Result<unknown, R> | undefined>
```

Stop the batch processor. Flushes any pending items and prevents new items from being added.

**Returns:** `Promise<Result<unknown, R> | undefined>`

*Source: [batch.ts:169](packages/go-go-scope/src/batch.ts#L169)*

---

### BroadcastChannel.subscribe

```typescript
BroadcastChannel.subscribe(): AsyncIterable<T>
```

Subscribe to the broadcast channel. Returns an async iterable that receives all messages published to the channel. Each subscriber maintains its own queue, so slow consumers don't block others.

**Returns:** `AsyncIterable<T>`

AsyncIterable that yields all broadcast messages

**Examples:**

```typescript
await using s = scope();
const broadcast = s.broadcast<string>();

// Subscribe and consume messages
for await (const msg of broadcast.subscribe()) {
  console.log('Received:', msg);
}
```

```typescript
// Using break to stop subscribing
s.task(async () => {
  let count = 0;
  for await (const msg of broadcast.subscribe()) {
    console.log(msg);
    if (++count >= 10) break; // Stop after 10 messages
  }
  // Subscriber is automatically cleaned up
});
```

**@returns:** AsyncIterable that yields all broadcast messages

**@throws:** If the channel is already closed

*Source: [broadcast-channel.ts:146](packages/go-go-scope/src/broadcast-channel.ts#L146)*

---

### BroadcastChannel.send

```typescript
BroadcastChannel.send(value: T): Promise<boolean>
```

Send a value to all subscribers. Resolves when all subscribers have received the message. If a subscriber is not actively waiting, the message is queued for them.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` | - The value to broadcast to all subscribers |

**Returns:** `Promise<boolean>`

Promise that resolves to true if sent successfully, false if channel is closed

**Examples:**

```typescript
await using s = scope();
const events = s.broadcast<{ type: string; data: unknown }>();

// Multiple subscribers
s.task(async () => {
  for await (const event of events.subscribe()) {
    console.log('Handler 1:', event.type);
  }
});

s.task(async () => {
  for await (const event of events.subscribe()) {
    console.log('Handler 2:', event.type);
  }
});

// Both handlers receive this message
await events.send({ type: 'user.login', data: { userId: 123 } });
```

**@param:** - The value to broadcast to all subscribers

**@returns:** Promise that resolves to true if sent successfully, false if channel is closed

**@throws:** If the scope is aborted

*Source: [broadcast-channel.ts:226](packages/go-go-scope/src/broadcast-channel.ts#L226)*

---

### BroadcastChannel.close

```typescript
BroadcastChannel.close(): void
```

Close the channel. No more messages can be sent. Existing subscribers will drain their queued messages, then their iterators will complete (done: true).

**Returns:** `void`

**Examples:**

```typescript
await using s = scope();
const broadcast = s.broadcast<string>();

const sub = broadcast.subscribe();

await broadcast.send('message 1');
await broadcast.send('message 2');

broadcast.close();

// Subscriber can still drain queued messages
for await (const msg of sub) {
  console.log(msg); // 'message 1', 'message 2'
}

// After this, sends will return false
const result = await broadcast.send('message 3'); // false
```

*Source: [broadcast-channel.ts:311](packages/go-go-scope/src/broadcast-channel.ts#L311)*

---

### InMemoryCache.get

```typescript
InMemoryCache.get<T>(key: string): Promise<T | null>
```

Retrieves a value from the cache. Returns `null` if: - The key doesn't exist - The entry has expired (entry is also deleted) Updates the last accessed time for LRU tracking on successful retrieval.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The cache key |

**Returns:** `Promise<T | null>`

The cached value or `null` if not found/expired

**Examples:**

```typescript
const user = await cache.get<User>("user:123");
if (user) {
  console.log(user.name);
}
```

**@typeParam:** T - The expected type of the cached value

**@param:** - The cache key

**@returns:** The cached value or `null` if not found/expired

*Source: [cache.ts:142](packages/go-go-scope/src/cache.ts#L142)*

---

### InMemoryCache.set

```typescript
InMemoryCache.set<T>(key: string, value: T, ttl?: number): Promise<void>
```

Stores a value in the cache with optional TTL. If the cache is at capacity and the key doesn't exist, the least recently used entry is evicted before insertion.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The cache key |
| `value` | `T` | - The value to store |
| `ttl` (optional) | `number` | - Time-to-live in milliseconds (optional, no expiration if omitted) |

**Returns:** `Promise<void>`

Promise that resolves when the value is stored

**Examples:**

```typescript
// Store without expiration
await cache.set("config", { theme: "dark" });

// Store with 5 minute TTL
await cache.set("session", sessionData, 5 * 60 * 1000);
```

**@typeParam:** T - The type of the value to cache

**@param:** - Time-to-live in milliseconds (optional, no expiration if omitted)

**@returns:** Promise that resolves when the value is stored

*Source: [cache.ts:184](packages/go-go-scope/src/cache.ts#L184)*

---

### InMemoryCache.delete

```typescript
InMemoryCache.delete(key: string): Promise<void>
```

Deletes a key from the cache.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The cache key to delete |

**Returns:** `Promise<void>`

Promise that resolves when the key is deleted

**Examples:**

```typescript
await cache.delete("user:123");
```

**@param:** - The cache key to delete

**@returns:** Promise that resolves when the key is deleted

*Source: [cache.ts:210](packages/go-go-scope/src/cache.ts#L210)*

---

### InMemoryCache.has

```typescript
InMemoryCache.has(key: string): Promise<boolean>
```

Checks if a key exists in the cache and has not expired. Expired entries are automatically removed and return `false`.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The cache key to check |

**Returns:** `Promise<boolean>`

`true` if the key exists and is not expired, `false` otherwise

**Examples:**

```typescript
if (await cache.has("session:abc")) {
  // Session is valid
}
```

**@param:** - The cache key to check

**@returns:** `true` if the key exists and is not expired, `false` otherwise

*Source: [cache.ts:229](packages/go-go-scope/src/cache.ts#L229)*

---

### InMemoryCache.clear

```typescript
InMemoryCache.clear(): Promise<void>
```

Clears all entries from the cache and resets statistics.

**Returns:** `Promise<void>`

Promise that resolves when the cache is cleared

**Examples:**

```typescript
await cache.clear();
console.log(cache.size); // 0
```

**@returns:** Promise that resolves when the cache is cleared

*Source: [cache.ts:256](packages/go-go-scope/src/cache.ts#L256)*

---

### InMemoryCache.keys

```typescript
InMemoryCache.keys(pattern?: string): Promise<string[]>
```

Returns all keys matching an optional pattern. Pattern matching supports `*` as a wildcard that matches any characters. If no pattern is provided, all keys are returned.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pattern` (optional) | `string` | - Optional glob pattern (supports `*` wildcard) |

**Returns:** `Promise<string[]>`

Array of matching keys

**Examples:**

```typescript
await cache.set("user:1", data);
await cache.set("user:2", data);
await cache.set("product:1", data);

const userKeys = await cache.keys("user:*"); // ["user:1", "user:2"]
const allKeys = await cache.keys(); // ["user:1", "user:2", "product:1"]
```

**@param:** - Optional glob pattern (supports `*` wildcard)

**@returns:** Array of matching keys

*Source: [cache.ts:281](packages/go-go-scope/src/cache.ts#L281)*

---

### InMemoryCache.stats

```typescript
InMemoryCache.stats(): CacheStats
```

Gets cache statistics including hits, misses, size, and hit ratio.

**Returns:** `CacheStats`

Cache statistics object

**Examples:**

```typescript
const stats = cache.stats();
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
console.log(`Entries: ${stats.size}`);
```

**@returns:** CacheStats.hitRatio - Ratio of hits to total lookups (0-1)

*Source: [cache.ts:309](packages/go-go-scope/src/cache.ts#L309)*

---

### InMemoryCache.prune

```typescript
InMemoryCache.prune(): number
```

Removes all expired entries from the cache. This can be called periodically to free up memory from expired entries that haven't been accessed yet.

**Returns:** `number`

The number of entries removed

**Examples:**

```typescript
// Clean up expired entries
const removed = cache.prune();
console.log(`Pruned ${removed} expired entries`);
```

**@returns:** The number of entries removed

*Source: [cache.ts:334](packages/go-go-scope/src/cache.ts#L334)*

---

### InMemoryCache.evictLRU

```typescript
InMemoryCache.evictLRU(): void
```

Evicts the least recently used entry when the cache is at capacity.

**Returns:** `void`

**@internal:** 

*Source: [cache.ts:352](packages/go-go-scope/src/cache.ts#L352)*

---

### Channel.cleanupSampleBuffer

```typescript
Channel.cleanupSampleBuffer(): void
```

Clean up expired sample buffer entries.

**Returns:** `void`

**@internal:** 

*Source: [channel.ts:312](packages/go-go-scope/src/channel.ts#L312)*

---

### Channel.scheduleNotifications

```typescript
Channel.scheduleNotifications(): void
```

Process pending notifications in a batch. Reduces event loop pressure by batching resolve calls.

**Returns:** `void`

**@internal:** 

*Source: [channel.ts:334](packages/go-go-scope/src/channel.ts#L334)*

---

### Channel.processNotifications

```typescript
Channel.processNotifications(): void
```

Process pending send and receive notifications.

**Returns:** `void`

**@internal:** 

*Source: [channel.ts:350](packages/go-go-scope/src/channel.ts#L350)*

---

### Channel.dequeueInternal

```typescript
Channel.dequeueInternal(): T | undefined
```

Internal dequeue that handles different backpressure strategies.

**Returns:** `T | undefined`

**@internal:** 

*Source: [channel.ts:397](packages/go-go-scope/src/channel.ts#L397)*

---

### Channel.send

```typescript
Channel.send(value: T): Promise<boolean>
```

Send a value to the channel. Behavior depends on backpressure strategy: - **'block'**: Blocks if buffer full until space is available (default) - **'drop-oldest'**: Removes oldest item to make room - **'drop-latest'**: Drops the new item when buffer full - **'error'**: Throws {@link ChannelFullError} when buffer full - **'sample'**: Keeps only values within time window

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` | - The value to send |

**Returns:** `Promise<boolean>`

Promise that resolves to true if send was successful, false if channel is closed

**Examples:**

```typescript
await using s = scope();
const ch = s.channel<string>(10);

const success = await ch.send('hello');
if (success) {
  console.log('Message sent successfully');
}
```

**@param:** - The value to send

**@returns:** Promise that resolves to true if send was successful, false if channel is closed

**@throws:** If backpressure strategy is 'error' and buffer is full

*Source: [channel.ts:438](packages/go-go-scope/src/channel.ts#L438)*

---

### Channel.receive

```typescript
Channel.receive(): Promise<T | undefined>
```

Receive a value from the channel.

**Returns:** `Promise<T | undefined>`

Promise that resolves to the received value, or undefined if channel is closed and empty

**Examples:**

```typescript
await using s = scope();
const ch = s.channel<string>(10);

// In a producer task
s.task(async () => {
  await ch.send('hello');
  ch.close();
});

// In a consumer task
const value = await ch.receive();
console.log(value); // 'hello'

const empty = await ch.receive();
console.log(empty); // undefined (channel closed)
```

**@returns:** Promise that resolves to the received value, or undefined if channel is closed and empty

**@throws:** If the scope is aborted

*Source: [channel.ts:572](packages/go-go-scope/src/channel.ts#L572)*

---

### Channel.close

```typescript
Channel.close(): void
```

Close the channel. No more sends allowed. Consumers will drain the buffer then receive undefined.

**Returns:** `void`

**Examples:**

```typescript
await using s = scope();
const ch = s.channel<string>(10);

await ch.send('message');
ch.close();

// After close, send returns false
const result = await ch.send('another'); // false
```

*Source: [channel.ts:657](packages/go-go-scope/src/channel.ts#L657)*

---

### Channel.drainQueues

```typescript
Channel.drainQueues(): void
```

Drain all pending queues on close/abort.

**Returns:** `void`

**@internal:** 

*Source: [channel.ts:752](packages/go-go-scope/src/channel.ts#L752)*

---

### Channel.map

```typescript
Channel.map<R>(fn: (value: T) => R): Channel<R>
```

Transform each value using a mapping function. Returns a new channel with transformed values. The original channel continues to operate normally. Values are forwarded through the mapping function as they arrive.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(value: T) => R` | - Mapping function to apply to each value |

**Returns:** `Channel<R>`

New channel with mapped values

**Examples:**

```typescript
await using s = scope();
const numbers = s.channel<number>(10);
const doubled = numbers.map(x => x * 2);

await numbers.send(5);
await numbers.send(10);
numbers.close();

console.log(await doubled.receive()); // 10
console.log(await doubled.receive()); // 20
```

**@typeParam:** R - Return type of the mapping function

**@param:** - Mapping function to apply to each value

**@returns:** New channel with mapped values

**@see:** {@link take} for limiting the number of values

*Source: [channel.ts:810](packages/go-go-scope/src/channel.ts#L810)*

---

### Channel.filter

```typescript
Channel.filter(predicate: (value: T) => boolean): Channel<T>
```

Filter values based on a predicate. Returns a new channel with only values that match the predicate. The original channel continues to operate normally. Only values that satisfy the predicate are forwarded to the new channel.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `predicate` | `(value: T) => boolean` | - Filter function that returns true for values to keep |

**Returns:** `Channel<T>`

New channel with filtered values

**Examples:**

```typescript
await using s = scope();
const numbers = s.channel<number>(10);
const evens = numbers.filter(x => x % 2 === 0);

await numbers.send(1);
await numbers.send(2);
await numbers.send(3);
await numbers.send(4);
numbers.close();

console.log(await evens.receive()); // 2 (1 was filtered out)
console.log(await evens.receive()); // 4 (3 was filtered out)
```

**@param:** - Filter function that returns true for values to keep

**@returns:** New channel with filtered values

**@see:** {@link take} for limiting the number of values

*Source: [channel.ts:858](packages/go-go-scope/src/channel.ts#L858)*

---

### Channel.reduce

```typescript
Channel.reduce<R>(fn: (accumulator: R, value: T) => R, initial: R): Promise<R>
```

Reduce all values to a single value. Returns a promise that resolves when the channel is closed. This is a terminal operation - it consumes all values from the channel and produces a single accumulated result.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(accumulator: R, value: T) => R` | - Reducer function that combines accumulator with each value |
| `initial` | `R` | - Initial accumulator value |

**Returns:** `Promise<R>`

Promise that resolves to the final accumulated value

**Examples:**

```typescript
await using s = scope();
const numbers = s.channel<number>(10);

const sumPromise = numbers.reduce((acc, x) => acc + x, 0);

await numbers.send(1);
await numbers.send(2);
await numbers.send(3);
numbers.close();

const sum = await sumPromise; // 6
```

```typescript
// Building a string from messages
const words = s.channel<string>(10);
const sentence = words.reduce((acc, word) => acc + ' ' + word, '');

await words.send('Hello');
await words.send('World');
words.close();

console.log(await sentence); // ' Hello World'
```

**@typeParam:** R - Type of the accumulator and result

**@param:** - Initial accumulator value

**@returns:** Promise that resolves to the final accumulated value

*Source: [channel.ts:917](packages/go-go-scope/src/channel.ts#L917)*

---

### Channel.take

```typescript
Channel.take(count: number): Channel<T>
```

Take only the first n values from the channel. Returns a new channel that automatically closes after n values. This is useful for limiting the amount of data processed from an unbounded stream of values.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `count` | `number` | - Number of values to take before closing |

**Returns:** `Channel<T>`

New channel limited to n values

**Examples:**

```typescript
await using s = scope();
const infinite = s.channel<number>(100);
const firstFive = infinite.take(5);

// Producer sends many values
s.task(async () => {
  for (let i = 0; i < 1000; i++) {
    await infinite.send(i);
  }
});

// Consumer only receives first 5
const values: number[] = [];
for await (const value of firstFive) {
  values.push(value);
}
console.log(values); // [0, 1, 2, 3, 4]
```

**@param:** - Number of values to take before closing

**@returns:** New channel limited to n values

**@see:** {@link filter} for filtering values

*Source: [channel.ts:969](packages/go-go-scope/src/channel.ts#L969)*

---

### InMemoryCheckpointProvider.save

```typescript
InMemoryCheckpointProvider.save<T>(checkpoint: Checkpoint<T>): Promise<void>
```

Saves a checkpoint for a task.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `checkpoint` | `Checkpoint<T>` | - The checkpoint to save |

**Returns:** `Promise<void>`

Promise that resolves when the checkpoint is saved

**Examples:**

```typescript
await provider.save({
  id: 'task-1-1234567890-1',
  taskId: 'task-1',
  sequence: 1,
  timestamp: Date.now(),
  progress: 50,
  data: { processed: 100 }
});
```

**@typeParam:** T - The type of checkpoint data

**@param:** - The checkpoint to save

**@returns:** Promise that resolves when the checkpoint is saved

*Source: [checkpoint.ts:142](packages/go-go-scope/src/checkpoint.ts#L142)*

---

### InMemoryCheckpointProvider.loadLatest

```typescript
InMemoryCheckpointProvider.loadLatest<T>(taskId: string): Promise<Checkpoint<T> | undefined>
```

Loads the most recent checkpoint for a task.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` | - The task ID to look up |

**Returns:** `Promise<Checkpoint<T> | undefined>`

The latest checkpoint or undefined if none exists

**Examples:**

```typescript
const checkpoint = await provider.loadLatest<MyState>('data-processing');
if (checkpoint) {
  console.log(`Resuming from checkpoint ${checkpoint.sequence}`);
  console.log(`Progress: ${checkpoint.progress}%`);
  return checkpoint.data; // Typed as MyState
}
```

**@typeParam:** T - The expected type of checkpoint data

**@param:** - The task ID to look up

**@returns:** The latest checkpoint or undefined if none exists

*Source: [checkpoint.ts:165](packages/go-go-scope/src/checkpoint.ts#L165)*

---

### InMemoryCheckpointProvider.load

```typescript
InMemoryCheckpointProvider.load<T>(checkpointId: string): Promise<Checkpoint<T> | undefined>
```

Loads a specific checkpoint by its ID.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `checkpointId` | `string` | - The unique checkpoint ID |

**Returns:** `Promise<Checkpoint<T> | undefined>`

The checkpoint or undefined if not found

**Examples:**

```typescript
const checkpoint = await provider.load<MyState>('task-1-1234567890-5');
```

**@typeParam:** T - The expected type of checkpoint data

**@param:** - The unique checkpoint ID

**@returns:** The checkpoint or undefined if not found

*Source: [checkpoint.ts:182](packages/go-go-scope/src/checkpoint.ts#L182)*

---

### InMemoryCheckpointProvider.list

```typescript
InMemoryCheckpointProvider.list(taskId: string): Promise<Checkpoint<unknown>[]>
```

Lists all checkpoints for a task, sorted by sequence.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` | - The task ID to look up |

**Returns:** `Promise<Checkpoint<unknown>[]>`

Array of checkpoints for the task

**Examples:**

```typescript
const checkpoints = await provider.list('data-processing');
for (const cp of checkpoints) {
  console.log(`Checkpoint ${cp.sequence}: ${cp.progress}%`);
}
```

**@param:** - The task ID to look up

**@returns:** Array of checkpoints for the task

*Source: [checkpoint.ts:204](packages/go-go-scope/src/checkpoint.ts#L204)*

---

### InMemoryCheckpointProvider.cleanup

```typescript
InMemoryCheckpointProvider.cleanup(taskId: string, keepCount: number): Promise<void>
```

Removes old checkpoints, keeping only the most recent ones.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` | - The task ID to clean up |
| `keepCount` | `number` | - Number of most recent checkpoints to keep |

**Returns:** `Promise<void>`

Promise that resolves when cleanup is complete

**Examples:**

```typescript
// Keep only the last 5 checkpoints
await provider.cleanup('data-processing', 5);
```

**@param:** - Number of most recent checkpoints to keep

**@returns:** Promise that resolves when cleanup is complete

*Source: [checkpoint.ts:221](packages/go-go-scope/src/checkpoint.ts#L221)*

---

### InMemoryCheckpointProvider.deleteAll

```typescript
InMemoryCheckpointProvider.deleteAll(taskId: string): Promise<void>
```

Deletes all checkpoints for a task.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` | - The task ID to delete |

**Returns:** `Promise<void>`

Promise that resolves when all checkpoints are deleted

**Examples:**

```typescript
// After task completes successfully, clean up checkpoints
await provider.deleteAll('data-processing');
```

**@param:** - The task ID to delete

**@returns:** Promise that resolves when all checkpoints are deleted

*Source: [checkpoint.ts:242](packages/go-go-scope/src/checkpoint.ts#L242)*

---

### CircuitBreaker.getAdaptiveThreshold

```typescript
CircuitBreaker.getAdaptiveThreshold(): number
```

Get the current adaptive failure threshold based on error rate. When adaptive threshold is enabled, the threshold decreases as the error rate increases, making the circuit more sensitive during periods of instability.

**Returns:** `number`

The adaptive failure threshold

**@returns:** The adaptive failure threshold

**@internal:** 

*Source: [circuit-breaker.ts:202](packages/go-go-scope/src/circuit-breaker.ts#L202)*

---

### CircuitBreaker.getFailureCount

```typescript
CircuitBreaker.getFailureCount(): number
```

Get the current failure count within the sliding window. If sliding window is disabled, returns the cumulative failure count.

**Returns:** `number`

Number of failures in the current window

**@returns:** Number of failures in the current window

**@internal:** 

*Source: [circuit-breaker.ts:250](packages/go-go-scope/src/circuit-breaker.ts#L250)*

---

### CircuitBreaker.execute

```typescript
CircuitBreaker.execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>
```

Execute a function with circuit breaker protection. If the circuit is open, throws immediately without calling the function. If the circuit is half-open, allows the call but tracks success/failure. If the circuit is closed, calls the function normally.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(signal: AbortSignal) => Promise<T>` | - Function to execute with circuit breaker protection |

**Returns:** `Promise<T>`

Promise that resolves to the function's return value

**Examples:**

```typescript
const cb = new CircuitBreaker({ failureThreshold: 3 });

try {
  const result = await cb.execute(async (signal) => {
    const response = await fetch('/api/data', { signal });
    if (!response.ok) throw new Error('API error');
    return await response.json();
  });
  console.log('Data:', result);
} catch (error) {
  if (error.message === 'Circuit breaker is open') {
    console.log('Service is down, using cached data');
  } else {
    console.log('Request failed:', error);
  }
}
```

**@typeParam:** T - Return type of the function

**@param:** - Function to execute with circuit breaker protection

**@returns:** Promise that resolves to the function's return value

**@throws:** Any error thrown by the function or parent signal abort

*Source: [circuit-breaker.ts:299](packages/go-go-scope/src/circuit-breaker.ts#L299)*

---

### CircuitBreaker.reset

```typescript
CircuitBreaker.reset(): void
```

Manually reset the circuit breaker to closed state. This clears all failure counts and transitions to the closed state. Use this when you know the underlying service has recovered.

**Returns:** `void`

**Examples:**

```typescript
const cb = new CircuitBreaker();

// Circuit opens due to failures
console.log(cb.currentState); // 'open'

// Manually reset after confirming service is healthy
cb.reset();
console.log(cb.currentState); // 'closed'
```

*Source: [circuit-breaker.ts:484](packages/go-go-scope/src/circuit-breaker.ts#L484)*

---

### CircuitBreaker.on

```typescript
CircuitBreaker.on(event: CircuitBreakerEvent, handler: EventHandler): () => void
```

Subscribe to a circuit breaker event. - 'stateChange': Circuit state changed - 'open': Circuit opened - 'close': Circuit closed - 'halfOpen': Circuit entered half-open state - 'success': Protected call succeeded - 'failure': Protected call failed - 'thresholdAdapt': Adaptive threshold changed

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `CircuitBreakerEvent` | - Event name to subscribe to:
- 'stateChange': Circuit state changed
- 'open': Circuit opened
- 'close': Circuit closed
- 'halfOpen': Circuit entered half-open state
- 'success': Protected call succeeded
- 'failure': Protected call failed
- 'thresholdAdapt': Adaptive threshold changed |
| `handler` | `EventHandler` | - Event handler function |

**Returns:** `() => void`

Unsubscribe function - call this to remove the subscription

**Examples:**

```typescript
const cb = new CircuitBreaker();

// Subscribe to state changes
const unsubscribe = cb.on('stateChange', (from, to, failures) => {
  console.log(`Circuit: ${from} -> ${to}`);
});

// Later: unsubscribe
unsubscribe();
```

```typescript
// Subscribe to open event to alert on-call
cb.on('open', (failureCount) => {
  pagerDuty.trigger({
    severity: 'critical',
    message: `Circuit opened after ${failureCount} failures`
  });
});
```

**@param:** - Event handler function

**@returns:** Unsubscribe function - call this to remove the subscription

**@see:** {@link once} for one-time subscriptions

*Source: [circuit-breaker.ts:545](packages/go-go-scope/src/circuit-breaker.ts#L545)*

---

### CircuitBreaker.off

```typescript
CircuitBreaker.off(event: CircuitBreakerEvent, handler: EventHandler): void
```

Unsubscribe from a circuit breaker event.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `CircuitBreakerEvent` | - Event name to unsubscribe from |
| `handler` | `EventHandler` | - Handler function to remove (must be the same reference passed to on()) |

**Returns:** `void`

**Examples:**

```typescript
const handler = (failures) => console.log('Open!', failures);

cb.on('open', handler);
// ... later ...
cb.off('open', handler);
```

**@param:** - Handler function to remove (must be the same reference passed to on())

**@see:** {@link on} for subscribing with automatic unsubscribe function

*Source: [circuit-breaker.ts:574](packages/go-go-scope/src/circuit-breaker.ts#L574)*

---

### CircuitBreaker.once

```typescript
CircuitBreaker.once(event: CircuitBreakerEvent, handler: EventHandler): void
```

Subscribe to an event once. The handler is automatically removed after the first occurrence.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `CircuitBreakerEvent` | - Event name to subscribe to |
| `handler` | `EventHandler` | - Event handler function |

**Returns:** `void`

**Examples:**

```typescript
// Alert only on the first open
cb.once('open', (failures) => {
  console.log('Circuit opened for the first time!');
});
```

**@param:** - Event handler function

*Source: [circuit-breaker.ts:594](packages/go-go-scope/src/circuit-breaker.ts#L594)*

---

### CircuitBreaker.emit

```typescript
CircuitBreaker.emit(event: CircuitBreakerEvent, ...args: unknown[]): void
```

Emit an event to all subscribers.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `CircuitBreakerEvent` | - Event to emit |
| `args` | `unknown[]` | - Arguments to pass to handlers |

**Returns:** `void`

**@param:** - Arguments to pass to handlers

**@internal:** 

*Source: [circuit-breaker.ts:609](packages/go-go-scope/src/circuit-breaker.ts#L609)*

---

### CircuitBreaker.onSuccess

```typescript
CircuitBreaker.onSuccess(): void
```

Handle a successful execution.

**Returns:** `void`

**@internal:** 

*Source: [circuit-breaker.ts:625](packages/go-go-scope/src/circuit-breaker.ts#L625)*

---

### CircuitBreaker.onFailure

```typescript
CircuitBreaker.onFailure(): void
```

Handle a failed execution.

**Returns:** `void`

**@internal:** 

*Source: [circuit-breaker.ts:673](packages/go-go-scope/src/circuit-breaker.ts#L673)*

---

### CircuitBreaker.transitionToHalfOpen

```typescript
CircuitBreaker.transitionToHalfOpen(): void
```

Transition from open to half-open state.

**Returns:** `void`

**@internal:** 

*Source: [circuit-breaker.ts:720](packages/go-go-scope/src/circuit-breaker.ts#L720)*

---

### ScopedEventEmitter.on

```typescript
ScopedEventEmitter.on<K extends keyof Events>(event: K, handler: Events[K]): () => void
```

Subscribe to an event.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |
| `handler` | `Events[K]` | - Event handler |

**Returns:** `() => void`

Unsubscribe function

**Examples:**

```typescript
const unsubscribe = emitter.on("data", (chunk) => {
  console.log(chunk);
});

// Later: manually unsubscribe
unsubscribe();
```

**@param:** - Event handler

**@returns:** Unsubscribe function

*Source: [event-emitter.ts:77](packages/go-go-scope/src/event-emitter.ts#L77)*

---

### ScopedEventEmitter.once

```typescript
ScopedEventEmitter.once<K extends keyof Events>(event: K, handler: Events[K]): void
```

Subscribe to an event once. The handler is automatically removed after first call.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |
| `handler` | `Events[K]` | - Event handler |

**Returns:** `void`

**Examples:**

```typescript
emitter.once("ready", () => {
  console.log("Ready! (only once)");
});
```

**@param:** - Event handler

*Source: [event-emitter.ts:106](packages/go-go-scope/src/event-emitter.ts#L106)*

---

### ScopedEventEmitter.off

```typescript
ScopedEventEmitter.off<K extends keyof Events>(event: K, handler: Events[K]): void
```

Unsubscribe from an event.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |
| `handler` | `Events[K]` | - Handler to remove |

**Returns:** `void`

**@param:** - Handler to remove

*Source: [event-emitter.ts:121](packages/go-go-scope/src/event-emitter.ts#L121)*

---

### ScopedEventEmitter.emit

```typescript
ScopedEventEmitter.emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): number
```

Emit an event to all subscribers.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |
| `args` | `Parameters<Events[K]>` | - Arguments to pass to handlers |

**Returns:** `number`

Number of handlers called

**Examples:**

```typescript
emitter.emit("data", "Hello", 123);
```

**@param:** - Arguments to pass to handlers

**@returns:** Number of handlers called

*Source: [event-emitter.ts:137](packages/go-go-scope/src/event-emitter.ts#L137)*

---

### ScopedEventEmitter.emitAsync

```typescript
ScopedEventEmitter.emitAsync<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): Promise<number>
```

Emit an event asynchronously (await all handlers).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |
| `args` | `Parameters<Events[K]>` | - Arguments to pass to handlers |

**Returns:** `Promise<number>`

Number of handlers called

**@param:** - Arguments to pass to handlers

**@returns:** Number of handlers called

*Source: [event-emitter.ts:170](packages/go-go-scope/src/event-emitter.ts#L170)*

---

### ScopedEventEmitter.listenerCount

```typescript
ScopedEventEmitter.listenerCount<K extends keyof Events>(event: K): number
```

Get the number of listeners for an event.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |

**Returns:** `number`

**@param:** - Event name

*Source: [event-emitter.ts:216](packages/go-go-scope/src/event-emitter.ts#L216)*

---

### ScopedEventEmitter.hasListeners

```typescript
ScopedEventEmitter.hasListeners<K extends keyof Events>(event: K): boolean
```

Check if there are any listeners for an event.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `K` | - Event name |

**Returns:** `boolean`

**@param:** - Event name

*Source: [event-emitter.ts:225](packages/go-go-scope/src/event-emitter.ts#L225)*

---

### ScopedEventEmitter.eventNames

```typescript
ScopedEventEmitter.eventNames(): (keyof Events)[]
```

Get all event names that have listeners.

**Returns:** `(keyof Events)[]`

*Source: [event-emitter.ts:232](packages/go-go-scope/src/event-emitter.ts#L232)*

---

### ScopedEventEmitter.removeAllListeners

```typescript
ScopedEventEmitter.removeAllListeners<K extends keyof Events>(event?: K): void
```

Remove all listeners for an event.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` (optional) | `K` | - Event name (if not provided, removes all listeners) |

**Returns:** `void`

**@param:** - Event name (if not provided, removes all listeners)

*Source: [event-emitter.ts:243](packages/go-go-scope/src/event-emitter.ts#L243)*

---

### ScopedEventEmitter.dispose

```typescript
ScopedEventEmitter.dispose(): void
```

Dispose the event emitter and remove all listeners.

**Returns:** `void`

*Source: [event-emitter.ts:254](packages/go-go-scope/src/event-emitter.ts#L254)*

---

### EnhancedGracefulShutdownController.trackTask

```typescript
EnhancedGracefulShutdownController.trackTask(taskId: symbol): { complete: () => void }
```

Register a task to be tracked during shutdown

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `symbol` |  |

**Returns:** `{ complete: () => void }`

*Source: [graceful-shutdown-enhanced.ts:98](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L98)*

---

### EnhancedGracefulShutdownController.onShutdownHook

```typescript
EnhancedGracefulShutdownController.onShutdownHook(hook: () => void | Promise<void>): void
```

Register a shutdown hook

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `hook` | `() => void | Promise<void>` |  |

**Returns:** `void`

*Source: [graceful-shutdown-enhanced.ts:115](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L115)*

---

### EnhancedGracefulShutdownController.shutdown

```typescript
EnhancedGracefulShutdownController.shutdown(signal: NodeJS.Signals = "SIGTERM"): Promise<void>
```

Perform shutdown with configured strategy

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` (optional) | `NodeJS.Signals` |  |

**Returns:** `Promise<void>`

*Source: [graceful-shutdown-enhanced.ts:122](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L122)*

---

### EnhancedGracefulShutdownController.immediateShutdown

```typescript
EnhancedGracefulShutdownController.immediateShutdown(signal: NodeJS.Signals): Promise<void>
```

Immediate shutdown - stop accepting new work immediately

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `NodeJS.Signals` |  |

**Returns:** `Promise<void>`

*Source: [graceful-shutdown-enhanced.ts:189](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L189)*

---

### EnhancedGracefulShutdownController.drainShutdown

```typescript
EnhancedGracefulShutdownController.drainShutdown(signal: NodeJS.Signals): Promise<void>
```

Drain shutdown - wait for in-flight tasks to complete

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `NodeJS.Signals` |  |

**Returns:** `Promise<void>`

*Source: [graceful-shutdown-enhanced.ts:197](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L197)*

---

### EnhancedGracefulShutdownController.timeoutShutdown

```typescript
EnhancedGracefulShutdownController.timeoutShutdown(signal: NodeJS.Signals): Promise<void>
```

Timeout shutdown - wait up to timeout, then force

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `NodeJS.Signals` |  |

**Returns:** `Promise<void>`

*Source: [graceful-shutdown-enhanced.ts:235](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L235)*

---

### EnhancedGracefulShutdownController.hybridShutdown

```typescript
EnhancedGracefulShutdownController.hybridShutdown(signal: NodeJS.Signals): Promise<void>
```

Hybrid shutdown - drain with timeout fallback

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` | `NodeJS.Signals` |  |

**Returns:** `Promise<void>`

*Source: [graceful-shutdown-enhanced.ts:249](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L249)*

---

### EnhancedGracefulShutdownController.setupTaskTracking

```typescript
EnhancedGracefulShutdownController.setupTaskTracking(scope: Scope<Record<string, unknown>>): void
```

Setup automatic task tracking

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope<Record<string, unknown>>` |  |

**Returns:** `void`

*Source: [graceful-shutdown-enhanced.ts:301](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L301)*

---

### ShutdownCoordinator.register

```typescript
ShutdownCoordinator.register(name: string, scope: Scope, options: EnhancedGracefulShutdownOptions = {}): EnhancedGracefulShutdownController
```

Register a scope with the coordinator

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `scope` | `Scope` |  |
| `options` (optional) | `EnhancedGracefulShutdownOptions` |  |

**Returns:** `EnhancedGracefulShutdownController`

*Source: [graceful-shutdown-enhanced.ts:372](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L372)*

---

### ShutdownCoordinator.addDependency

```typescript
ShutdownCoordinator.addDependency(scope: string, dependsOn: string): void
```

Register a dependency between scopes (dependency must shutdown first)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `string` |  |
| `dependsOn` | `string` |  |

**Returns:** `void`

*Source: [graceful-shutdown-enhanced.ts:385](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L385)*

---

### ShutdownCoordinator.shutdownAll

```typescript
ShutdownCoordinator.shutdownAll(signal: NodeJS.Signals = "SIGTERM"): Promise<Map<string, Error | undefined>>
```

Shutdown all scopes in dependency order

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` (optional) | `NodeJS.Signals` |  |

**Returns:** `Promise<Map<string, Error | undefined>>`

*Source: [graceful-shutdown-enhanced.ts:395](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L395)*

---

### ShutdownCoordinator.calculateShutdownOrder

```typescript
ShutdownCoordinator.calculateShutdownOrder(): string[]
```

Calculate shutdown order based on dependencies

**Returns:** `string[]`

*Source: [graceful-shutdown-enhanced.ts:422](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L422)*

---

### ShutdownCoordinator.getStatus

```typescript
ShutdownCoordinator.getStatus(): Map<string, { state: ShutdownState; activeTasks: number }>
```

Get overall shutdown status

**Returns:** `Map<string, { state: ShutdownState; activeTasks: number }>`

*Source: [graceful-shutdown-enhanced.ts:458](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L458)*

---

### ProcessLifecycle.init

```typescript
ProcessLifecycle.init(scope: Scope, options: EnhancedGracefulShutdownOptions = {}): EnhancedGracefulShutdownController
```

Initialize process lifecycle

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `scope` | `Scope` |  |
| `options` (optional) | `EnhancedGracefulShutdownOptions` |  |

**Returns:** `EnhancedGracefulShutdownController`

*Source: [graceful-shutdown-enhanced.ts:493](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L493)*

---

### ProcessLifecycle.initWithCoordinator

```typescript
ProcessLifecycle.initWithCoordinator(): ShutdownCoordinator
```

Initialize with coordinator for multi-scope apps

**Returns:** `ShutdownCoordinator`

*Source: [graceful-shutdown-enhanced.ts:520](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L520)*

---

### ProcessLifecycle.getController

```typescript
ProcessLifecycle.getController(): EnhancedGracefulShutdownController
```

Get controller (throws if not initialized)

**Returns:** `EnhancedGracefulShutdownController`

*Source: [graceful-shutdown-enhanced.ts:547](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L547)*

---

### ProcessLifecycle.getCoordinator

```typescript
ProcessLifecycle.getCoordinator(): ShutdownCoordinator
```

Get coordinator (throws if not initialized)

**Returns:** `ShutdownCoordinator`

*Source: [graceful-shutdown-enhanced.ts:557](packages/go-go-scope/src/graceful-shutdown-enhanced.ts#L557)*

---

### GracefulShutdownController.shutdown

```typescript
GracefulShutdownController.shutdown(signal: NodeJS.Signals = "SIGTERM"): Promise<void>
```

Manually trigger shutdown. Can be called programmatically to initiate shutdown without receiving a signal. If shutdown is already in progress, returns the existing shutdown promise.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `signal` (optional) | `NodeJS.Signals` | - The signal that triggered shutdown (default: 'SIGTERM') |

**Returns:** `Promise<void>`

Resolves when shutdown is complete

**Examples:**

```typescript
// Manual shutdown trigger
app.post('/admin/shutdown', async (req, res) => {
  res.json({ status: 'shutting down' });
  await controller.shutdown('SIGTERM');
});

// Shutdown on specific condition
s.task(async () => {
  if (await checkFatalCondition()) {
    console.error('Fatal condition detected, shutting down');
    await controller.shutdown('SIGTERM');
  }
});

// Graceful restart
process.on('SIGUSR2', () => {
  controller.shutdown('SIGUSR2').then(() => {
    // Restart logic
    spawn(process.argv0, process.argv.slice(1), { detached: true });
  });
});
```

**@param:** - The signal that triggered shutdown (default: 'SIGTERM')

**@returns:** Resolves when shutdown is complete

**@see:** {@link GracefulShutdownController.shutdownComplete} Wait for completion

*Source: [graceful-shutdown.ts:268](packages/go-go-scope/src/graceful-shutdown.ts#L268)*

---

### GracefulShutdownController.cleanup

```typescript
GracefulShutdownController.cleanup(): void
```

Remove signal handlers. Stops listening for shutdown signals. Useful for cleanup in tests or when you want to disable the controller without shutting down.

**Returns:** `void`

**Examples:**

```typescript
// Cleanup in tests
afterEach(() => {
  controller.cleanup();
});

// Disable graceful shutdown temporarily
controller.cleanup();
// ... do work without signal handling ...
// Re-enable if needed by creating new controller

// Clean shutdown sequence
async function cleanExit() {
  controller.cleanup();  // Stop listening for signals
  await controller.shutdown('SIGTERM');  // Manual shutdown
}
```

**@see:** {@link GracefulShutdownController.shutdown} For triggering shutdown

*Source: [graceful-shutdown.ts:362](packages/go-go-scope/src/graceful-shutdown.ts#L362)*

---

### GracefulShutdownController.setupSignalHandlers

```typescript
GracefulShutdownController.setupSignalHandlers(): void
```

Setup signal handlers for configured signals.

**Returns:** `void`

**@internal:** 

*Source: [graceful-shutdown.ts:377](packages/go-go-scope/src/graceful-shutdown.ts#L377)*

---

### GracefulShutdownController.setupScopeIntegration

```typescript
GracefulShutdownController.setupScopeIntegration(): void
```

Add shutdownRequested property to scope for easy access.

**Returns:** `void`

**@internal:** 

*Source: [graceful-shutdown.ts:400](packages/go-go-scope/src/graceful-shutdown.ts#L400)*

---

### InMemoryIdempotencyProvider.get

```typescript
InMemoryIdempotencyProvider.get<T>(key: string): Promise<{ value: T; expiresAt?: number } | null>
```

Gets a cached value by key if it exists and hasn't expired.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The idempotency key |

**Returns:** `Promise<{ value: T; expiresAt?: number } | null>`

Object with value and optional expiry timestamp, or `null` if not found/expired

**Examples:**

```typescript
const cached = await provider.get<PaymentResult>("payment:order-123");
if (cached) {
  console.log(`Cached result expires at: ${cached.expiresAt}`);
  return cached.value;
}
```

**@typeParam:** T - The expected type of the cached value

**@param:** - The idempotency key

**@returns:** Object with value and optional expiry timestamp, or `null` if not found/expired

*Source: [idempotency.ts:184](packages/go-go-scope/src/idempotency.ts#L184)*

---

### InMemoryIdempotencyProvider.set

```typescript
InMemoryIdempotencyProvider.set<T>(key: string, value: T, ttl?: number): Promise<void>
```

Stores a value with an optional TTL.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The idempotency key |
| `value` | `T` | - The result value to cache |
| `ttl` (optional) | `number` | - Time-to-live in milliseconds (optional, no expiration if omitted) |

**Returns:** `Promise<void>`

Promise that resolves when the value is stored

**Examples:**

```typescript
// Cache with 5 minute TTL
await provider.set("payment:order-123", result, 5 * 60 * 1000);

// Cache without expiration
await provider.set("config:default", config);
```

**@typeParam:** T - The type of the value to cache

**@param:** - Time-to-live in milliseconds (optional, no expiration if omitted)

**@returns:** Promise that resolves when the value is stored

*Source: [idempotency.ts:215](packages/go-go-scope/src/idempotency.ts#L215)*

---

### InMemoryIdempotencyProvider.delete

```typescript
InMemoryIdempotencyProvider.delete(key: string): Promise<void>
```

Deletes a cached value by key.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - The idempotency key to delete |

**Returns:** `Promise<void>`

Promise that resolves when the key is deleted

**Examples:**

```typescript
// Manually invalidate a cached result
await provider.delete("payment:order-123");
```

**@param:** - The idempotency key to delete

**@returns:** Promise that resolves when the key is deleted

*Source: [idempotency.ts:236](packages/go-go-scope/src/idempotency.ts#L236)*

---

### InMemoryIdempotencyProvider.clear

```typescript
InMemoryIdempotencyProvider.clear(): Promise<void>
```

Clears all cached idempotency entries.

**Returns:** `Promise<void>`

Promise that resolves when all entries are cleared

**Examples:**

```typescript
// Clear all cached results
await provider.clear();
console.log(provider.size); // 0
```

**@returns:** Promise that resolves when all entries are cleared

*Source: [idempotency.ts:252](packages/go-go-scope/src/idempotency.ts#L252)*

---

### InMemoryIdempotencyProvider.cleanup

```typescript
InMemoryIdempotencyProvider.cleanup(): number
```

Removes expired entries from the cache. This can be called periodically to free up memory. Expired entries are also removed automatically on access.

**Returns:** `number`

Number of expired entries removed

**Examples:**

```typescript
// Run periodic cleanup
setInterval(() => {
  const removed = provider.cleanup();
  console.log(`Cleaned up ${removed} expired entries`);
}, 60000);
```

**@returns:** Number of expired entries removed

*Source: [idempotency.ts:290](packages/go-go-scope/src/idempotency.ts#L290)*

---

### LockGuard.release

```typescript
LockGuard.release(): Promise<void>
```

Releases the lock manually. This can be called explicitly to release the lock before the guard goes out of scope. Throws an error if the lock has already been released.

**Returns:** `Promise<void>`

Promise that resolves when the lock is released

**Examples:**

```typescript
const guard = await lock.acquire();
await guard.release(); // Explicit release
```

**@returns:** Promise that resolves when the lock is released

**@throws:** Error if the lock has already been released

*Source: [lock.ts:230](packages/go-go-scope/src/lock.ts#L230)*

---

### Lock.acquire

```typescript
Lock.acquire(options: LockAcquireOptions = {}): Promise<LockGuard>
```

Acquires an exclusive lock (mutex mode). Only one holder can have the lock at a time. Other acquire calls will wait until the lock is released or the timeout expires. Only available when `allowMultipleReaders` is `false` (default).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `LockAcquireOptions` | - Acquisition options |

**Returns:** `Promise<LockGuard>`

A LockGuard that releases the lock when disposed

**Examples:**

```typescript
const lock = new Lock(s.signal);
 * // With timeout
await using guard = await lock.acquire({ timeout: 5000 });

// With priority (higher =优先)
await using guard = await lock.acquire({ priority: 10 });
```

**@param:** - Polling interval for distributed locks in milliseconds (default: 100)

**@returns:** A LockGuard that releases the lock when disposed

**@throws:** Error if acquisition times out

*Source: [lock.ts:447](packages/go-go-scope/src/lock.ts#L447)*

---

### Lock.read

```typescript
Lock.read(options: LockAcquireOptions = {}): Promise<LockGuard>
```

Acquires a read lock (read-write mode only). Multiple readers can hold the lock simultaneously, but writers are blocked. If there's a waiting writer with higher priority, new readers will wait. Only available when `allowMultipleReaders` is `true`.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `LockAcquireOptions` | - Acquisition options |

**Returns:** `Promise<LockGuard>`

A LockGuard that releases the read lock when disposed

**Examples:**

```typescript
const lock = new Lock(s.signal, { allowMultipleReaders: true });

// Multiple readers can acquire simultaneously
await using guard1 = await lock.read();
await using guard2 = await lock.read();

// Readers block writers
// const writeGuard = await lock.write(); // Waits for readers
```

**@param:** - Polling interval for distributed locks in milliseconds (default: 100)

**@returns:** A LockGuard that releases the read lock when disposed

**@throws:** Error if acquisition times out

*Source: [lock.ts:489](packages/go-go-scope/src/lock.ts#L489)*

---

### Lock.write

```typescript
Lock.write(options: LockAcquireOptions = {}): Promise<LockGuard>
```

Acquires a write lock (read-write mode only). Exclusive access - no other readers or writers can hold the lock. Writers have priority over new readers if they have higher priority. Only available when `allowMultipleReaders` is `true`.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `LockAcquireOptions` | - Acquisition options |

**Returns:** `Promise<LockGuard>`

A LockGuard that releases the write lock when disposed

**Examples:**

```typescript
const lock = new Lock(s.signal, { allowMultipleReaders: true });

// Writer has exclusive access
await using guard = await lock.write();
// No readers or other writers allowed here
```

**@param:** - Polling interval for distributed locks in milliseconds (default: 100)

**@returns:** A LockGuard that releases the write lock when disposed

**@throws:** Error if acquisition times out

*Source: [lock.ts:528](packages/go-go-scope/src/lock.ts#L528)*

---

### Lock.tryAcquire

```typescript
Lock.tryAcquire(): LockGuard | null
```

Tries to acquire the lock immediately without waiting. Returns `null` if the lock is not available. Only available for in-memory exclusive locks (not read-write or distributed).

**Returns:** `LockGuard | null`

A LockGuard if acquired, `null` if lock is not available

**Examples:**

```typescript
const lock = new Lock(s.signal);

using guard = lock.tryAcquire();
if (guard) {
  // Lock acquired - do work
  // Automatically released when guard goes out of scope
} else {
  // Lock not available - do something else
}
```

**@returns:** A LockGuard if acquired, `null` if lock is not available

**@throws:** Error if lock is in read-write mode or distributed

*Source: [lock.ts:564](packages/go-go-scope/src/lock.ts#L564)*

---

### Lock.tryRead

```typescript
Lock.tryRead(): LockGuard | null
```

Tries to acquire a read lock immediately (read-write mode only). Returns `null` if a writer is active or waiting with higher priority. Only available for in-memory locks.

**Returns:** `LockGuard | null`

A LockGuard if acquired, `null` if lock is not available

**Examples:**

```typescript
const lock = new Lock(s.signal, { allowMultipleReaders: true });

using guard = lock.tryRead();
if (guard) {
  // Read lock acquired
}
```

**@returns:** A LockGuard if acquired, `null` if lock is not available

**@throws:** Error if lock is not in read-write mode or is distributed

*Source: [lock.ts:610](packages/go-go-scope/src/lock.ts#L610)*

---

### Lock.tryWrite

```typescript
Lock.tryWrite(): LockGuard | null
```

Tries to acquire a write lock immediately (read-write mode only). Returns `null` if any readers or writers are active, or if there are pending requests. Only available for in-memory locks.

**Returns:** `LockGuard | null`

A LockGuard if acquired, `null` if lock is not available

**Examples:**

```typescript
const lock = new Lock(s.signal, { allowMultipleReaders: true });

using guard = lock.tryWrite();
if (guard) {
  // Write lock acquired exclusively
}
```

**@returns:** A LockGuard if acquired, `null` if lock is not available

**@throws:** Error if lock is not in read-write mode or is distributed

*Source: [lock.ts:651](packages/go-go-scope/src/lock.ts#L651)*

---

### Lock.acquireInMemoryExclusive

```typescript
Lock.acquireInMemoryExclusive(options: LockAcquireOptions): Promise<LockGuard>
```

// ============================================================================ // In-Memory Implementation // ============================================================================ Acquires an exclusive lock using in-memory coordination.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LockAcquireOptions` |  |

**Returns:** `Promise<LockGuard>`

**@internal:** 

*Source: [lock.ts:791](packages/go-go-scope/src/lock.ts#L791)*

---

### Lock.acquireInMemoryRead

```typescript
Lock.acquireInMemoryRead(options: LockAcquireOptions): Promise<LockGuard>
```

Acquires a read lock using in-memory coordination.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LockAcquireOptions` |  |

**Returns:** `Promise<LockGuard>`

**@internal:** 

*Source: [lock.ts:831](packages/go-go-scope/src/lock.ts#L831)*

---

### Lock.acquireInMemoryWrite

```typescript
Lock.acquireInMemoryWrite(options: LockAcquireOptions): Promise<LockGuard>
```

Acquires a write lock using in-memory coordination.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LockAcquireOptions` |  |

**Returns:** `Promise<LockGuard>`

**@internal:** 

*Source: [lock.ts:869](packages/go-go-scope/src/lock.ts#L869)*

---

### Lock.acquireDistributedExclusive

```typescript
Lock.acquireDistributedExclusive(options: LockAcquireOptions): Promise<LockGuard>
```

// ============================================================================ // Distributed Implementation // ============================================================================ Acquires an exclusive distributed lock.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LockAcquireOptions` |  |

**Returns:** `Promise<LockGuard>`

**@internal:** 

*Source: [lock.ts:913](packages/go-go-scope/src/lock.ts#L913)*

---

### Lock.tryAcquireDistributedExclusive

```typescript
Lock.tryAcquireDistributedExclusive(): Promise<LockGuard | null>
```

Attempts to acquire an exclusive distributed lock.

**Returns:** `Promise<LockGuard | null>`

**@internal:** 

*Source: [lock.ts:938](packages/go-go-scope/src/lock.ts#L938)*

---

### Lock.acquireDistributedRead

```typescript
Lock.acquireDistributedRead(options: LockAcquireOptions): Promise<LockGuard>
```

Acquires a distributed read lock.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LockAcquireOptions` |  |

**Returns:** `Promise<LockGuard>`

**@internal:** 

*Source: [lock.ts:965](packages/go-go-scope/src/lock.ts#L965)*

---

### Lock.tryAcquireDistributedRead

```typescript
Lock.tryAcquireDistributedRead(): Promise<LockGuard | null>
```

Attempts to acquire a distributed read lock.

**Returns:** `Promise<LockGuard | null>`

**@internal:** 

*Source: [lock.ts:990](packages/go-go-scope/src/lock.ts#L990)*

---

### Lock.acquireDistributedWrite

```typescript
Lock.acquireDistributedWrite(options: LockAcquireOptions): Promise<LockGuard>
```

Acquires a distributed write lock.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LockAcquireOptions` |  |

**Returns:** `Promise<LockGuard>`

**@internal:** 

*Source: [lock.ts:1030](packages/go-go-scope/src/lock.ts#L1030)*

---

### Lock.tryAcquireDistributedWrite

```typescript
Lock.tryAcquireDistributedWrite(): Promise<LockGuard | null>
```

Attempts to acquire a distributed write lock.

**Returns:** `Promise<LockGuard | null>`

**@internal:** 

*Source: [lock.ts:1057](packages/go-go-scope/src/lock.ts#L1057)*

---

### Lock.processQueue

```typescript
Lock.processQueue(): void
```

// ============================================================================ // Queue Processing // ============================================================================ Processes the lock request queue, granting locks when possible.

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1092](packages/go-go-scope/src/lock.ts#L1092)*

---

### Lock.releaseExclusive

```typescript
Lock.releaseExclusive(): void
```

// ============================================================================ // Release Methods // ============================================================================ Releases an exclusive lock and processes the queue.

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1173](packages/go-go-scope/src/lock.ts#L1173)*

---

### Lock.releaseRead

```typescript
Lock.releaseRead(): void
```

Releases a read lock and processes the queue.

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1182](packages/go-go-scope/src/lock.ts#L1182)*

---

### Lock.releaseWrite

```typescript
Lock.releaseWrite(): void
```

Releases a write lock and processes the queue.

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1191](packages/go-go-scope/src/lock.ts#L1191)*

---

### Lock.scheduleDistributedExtend

```typescript
Lock.scheduleDistributedExtend(key: string): void
```

// ============================================================================ // Distributed Helpers // ============================================================================ Schedules automatic extension of a distributed lock.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` |  |

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1204](packages/go-go-scope/src/lock.ts#L1204)*

---

### Lock.clearDistributedExtend

```typescript
Lock.clearDistributedExtend(): void
```

Clears the distributed lock extension timeout.

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1220](packages/go-go-scope/src/lock.ts#L1220)*

---

### Lock.removeRequest

```typescript
Lock.removeRequest(request: QueuedRequest): void
```

// ============================================================================ // Utility // ============================================================================ Removes a request from the queue.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `request` | `QueuedRequest` |  |

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1235](packages/go-go-scope/src/lock.ts#L1235)*

---

### Lock.clearTimeout

```typescript
Lock.clearTimeout(request: QueuedRequest): void
```

Clears the timeout for a request.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `request` | `QueuedRequest` |  |

**Returns:** `void`

**@internal:** 

*Source: [lock.ts:1246](packages/go-go-scope/src/lock.ts#L1246)*

---

### Lock.sleep

```typescript
Lock.sleep(ms: number): Promise<void>
```

Sleeps for the specified duration.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` |  |

**Returns:** `Promise<void>`

**@internal:** 

*Source: [lock.ts:1256](packages/go-go-scope/src/lock.ts#L1256)*

---

### CorrelatedLogger.formatMessage

```typescript
CorrelatedLogger.formatMessage(message: string): string
```

Formats a message with correlation ID prefixes.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The original message |

**Returns:** `string`

The formatted message with correlation prefixes

**@param:** - The original message

**@returns:** The formatted message with correlation prefixes

**@private:** 

*Source: [log-correlation.ts:229](packages/go-go-scope/src/log-correlation.ts#L229)*

---

### CorrelatedLogger.formatStructured

```typescript
CorrelatedLogger.formatStructured(): Record<string, string>
```

Returns the correlation context as a structured object.

**Returns:** `Record<string, string>`

Object containing traceId, spanId, scopeName, and optionally parentSpanId

**@returns:** Object containing traceId, spanId, scopeName, and optionally parentSpanId

**@private:** 

*Source: [log-correlation.ts:239](packages/go-go-scope/src/log-correlation.ts#L239)*

---

### CorrelatedLogger.debug

```typescript
CorrelatedLogger.debug(message: string, ...args: unknown[]): void
```

Log a debug message with correlation context.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [log-correlation.ts:256](packages/go-go-scope/src/log-correlation.ts#L256)*

---

### CorrelatedLogger.info

```typescript
CorrelatedLogger.info(message: string, ...args: unknown[]): void
```

Log an info message with correlation context.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [log-correlation.ts:270](packages/go-go-scope/src/log-correlation.ts#L270)*

---

### CorrelatedLogger.warn

```typescript
CorrelatedLogger.warn(message: string, ...args: unknown[]): void
```

Log a warning message with correlation context.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [log-correlation.ts:284](packages/go-go-scope/src/log-correlation.ts#L284)*

---

### CorrelatedLogger.error

```typescript
CorrelatedLogger.error(message: string, ...args: unknown[]): void
```

Log an error message with correlation context.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [log-correlation.ts:298](packages/go-go-scope/src/log-correlation.ts#L298)*

---

### CorrelatedLogger.getCorrelationContext

```typescript
CorrelatedLogger.getCorrelationContext(): CorrelationContext
```

Get the correlation context. Returns a copy of the correlation data for inspection or propagation.

**Returns:** `CorrelationContext`

A copy of the correlation context

**Examples:**

```typescript
import { CorrelatedLogger } from "go-go-scope";

const logger = new CorrelatedLogger(delegate, {
  traceId: "abc123",
  spanId: "xyz789",
  scopeName: "my-service"
});

const context = logger.getCorrelationContext();
console.log(context.traceId); // "abc123"

// Modify the copy without affecting the logger
context.traceId = "modified";
console.log(logger.getCorrelationContext().traceId); // Still "abc123"
```

**@returns:** A copy of the correlation context

*Source: [log-correlation.ts:330](packages/go-go-scope/src/log-correlation.ts#L330)*

---

### ConsoleLogger.debug

```typescript
ConsoleLogger.debug(message: string, ...args: unknown[]): void
```

Logs a debug message. Only outputs if the logger's level is set to 'debug'.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [logger.ts:84](packages/go-go-scope/src/logger.ts#L84)*

---

### ConsoleLogger.info

```typescript
ConsoleLogger.info(message: string, ...args: unknown[]): void
```

Logs an info message. Only outputs if the logger's level is 'debug' or 'info'.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [logger.ts:97](packages/go-go-scope/src/logger.ts#L97)*

---

### ConsoleLogger.warn

```typescript
ConsoleLogger.warn(message: string, ...args: unknown[]): void
```

Logs a warning message. Only outputs if the logger's level is 'debug', 'info', or 'warn'.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [logger.ts:110](packages/go-go-scope/src/logger.ts#L110)*

---

### ConsoleLogger.error

```typescript
ConsoleLogger.error(message: string, ...args: unknown[]): void
```

Logs an error message. Always outputs regardless of log level (errors have highest priority).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | - The message to log |
| `args` | `unknown[]` | - Additional arguments to log |

**Returns:** `void`

**@param:** - Additional arguments to log

*Source: [logger.ts:123](packages/go-go-scope/src/logger.ts#L123)*

---

### NoOpLogger.debug

```typescript
NoOpLogger.debug(): void
```

No-op debug method

**Returns:** `void`

*Source: [logger.ts:157](packages/go-go-scope/src/logger.ts#L157)*

---

### NoOpLogger.info

```typescript
NoOpLogger.info(): void
```

No-op info method

**Returns:** `void`

*Source: [logger.ts:159](packages/go-go-scope/src/logger.ts#L159)*

---

### NoOpLogger.warn

```typescript
NoOpLogger.warn(): void
```

No-op warn method

**Returns:** `void`

*Source: [logger.ts:161](packages/go-go-scope/src/logger.ts#L161)*

---

### NoOpLogger.error

```typescript
NoOpLogger.error(): void
```

No-op error method

**Returns:** `void`

*Source: [logger.ts:163](packages/go-go-scope/src/logger.ts#L163)*

---

### MemoryMonitor.start

```typescript
MemoryMonitor.start(): void
```

Start monitoring memory usage

**Returns:** `void`

*Source: [memory-monitor.ts:176](packages/go-go-scope/src/memory-monitor.ts#L176)*

---

### MemoryMonitor.checkMemory

```typescript
MemoryMonitor.checkMemory(): void
```

Check current memory usage and trigger callback if needed

**Returns:** `void`

*Source: [memory-monitor.ts:190](packages/go-go-scope/src/memory-monitor.ts#L190)*

---

### MemoryMonitor.getUsage

```typescript
MemoryMonitor.getUsage(): MemoryUsage
```

Get current memory usage

**Returns:** `MemoryUsage`

*Source: [memory-monitor.ts:234](packages/go-go-scope/src/memory-monitor.ts#L234)*

---

### MemoryMonitor.getLimit

```typescript
MemoryMonitor.getLimit(): number
```

Get the configured memory limit in bytes

**Returns:** `number`

*Source: [memory-monitor.ts:245](packages/go-go-scope/src/memory-monitor.ts#L245)*

---

### MemoryMonitor.setLimit

```typescript
MemoryMonitor.setLimit(limit: number | string): void
```

Update the memory limit

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `limit` | `number | string` |  |

**Returns:** `void`

*Source: [memory-monitor.ts:252](packages/go-go-scope/src/memory-monitor.ts#L252)*

---

### PerformanceMonitor.start

```typescript
PerformanceMonitor.start(): void
```

Start monitoring

**Returns:** `void`

*Source: [performance.ts:83](packages/go-go-scope/src/performance.ts#L83)*

---

### PerformanceMonitor.stop

```typescript
PerformanceMonitor.stop(): void
```

Stop monitoring

**Returns:** `void`

*Source: [performance.ts:94](packages/go-go-scope/src/performance.ts#L94)*

---

### PerformanceMonitor.takeSnapshot

```typescript
PerformanceMonitor.takeSnapshot(): PerformanceSnapshot
```

Take a manual snapshot

**Returns:** `PerformanceSnapshot`

*Source: [performance.ts:104](packages/go-go-scope/src/performance.ts#L104)*

---

### PerformanceMonitor.getMetrics

```typescript
PerformanceMonitor.getMetrics(): PerformanceMetrics
```

Get current metrics

**Returns:** `PerformanceMetrics`

*Source: [performance.ts:129](packages/go-go-scope/src/performance.ts#L129)*

---

### PerformanceMonitor.getSnapshots

```typescript
PerformanceMonitor.getSnapshots(): PerformanceSnapshot[]
```

Get all snapshots

**Returns:** `PerformanceSnapshot[]`

*Source: [performance.ts:169](packages/go-go-scope/src/performance.ts#L169)*

---

### PerformanceMonitor.getTrends

```typescript
PerformanceMonitor.getTrends(): {
		taskRateTrend: "increasing" | "decreasing" | "stable";
		durationTrend: "increasing" | "decreasing" | "stable";
	}
```

Get performance trends

**Returns:** `{
		taskRateTrend: "increasing" | "decreasing" | "stable";
		durationTrend: "increasing" | "decreasing" | "stable";
	}`

*Source: [performance.ts:176](packages/go-go-scope/src/performance.ts#L176)*

---

### MemoryTracker.snapshot

```typescript
MemoryTracker.snapshot(): number
```

Take a memory snapshot

**Returns:** `number`

*Source: [performance.ts:426](packages/go-go-scope/src/performance.ts#L426)*

---

### MemoryTracker.checkForLeaks

```typescript
MemoryTracker.checkForLeaks(thresholdPercent = 10): boolean
```

Check for memory leaks Returns true if memory appears to be leaking

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `thresholdPercent` (optional) | `unknown` |  |

**Returns:** `boolean`

*Source: [performance.ts:443](packages/go-go-scope/src/performance.ts#L443)*

---

### MemoryTracker.getGrowthRate

```typescript
MemoryTracker.getGrowthRate(): number
```

Get memory growth rate in bytes per second

**Returns:** `number`

*Source: [performance.ts:459](packages/go-go-scope/src/performance.ts#L459)*

---

### MemoryTracker.getSnapshots

```typescript
MemoryTracker.getSnapshots(): { timestamp: number; usage: number }[]
```

Get all snapshots

**Returns:** `{ timestamp: number; usage: number }[]`

*Source: [performance.ts:475](packages/go-go-scope/src/performance.ts#L475)*

---

### PriorityChannel.send

```typescript
PriorityChannel.send(value: T): Promise<void>
```

Send a value to the channel. If the buffer has space, the value is inserted immediately. If the buffer is full, blocks until space is available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` | - The value to send |

**Returns:** `Promise<void>`

Resolves when the value is sent

**Examples:**

```typescript
// Send with blocking if buffer full
await channel.send({ task: 'process', priority: 1 });

// Send in a loop
for (const task of tasks) {
  await channel.send(task);
}
```

**@param:** - The value to send

**@returns:** Resolves when the value is sent

**@throws:** If the channel is aborted

**@see:** {@link PriorityChannel.sendOrDrop} For drop-on-full behavior

*Source: [priority-channel.ts:369](packages/go-go-scope/src/priority-channel.ts#L369)*

---

### PriorityChannel.trySend

```typescript
PriorityChannel.trySend(value: T): boolean
```

Try to send a value without blocking. Returns true if the value was sent, false if the buffer is full.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` | - The value to send |

**Returns:** `boolean`

True if sent, false if buffer full

**Examples:**

```typescript
// Try to send without blocking
if (!channel.trySend(urgentTask)) {
  // Buffer full - handle differently
  await fallbackQueue.send(urgentTask);
}

// Send multiple items, skipping if full
for (const item of items) {
  if (!channel.trySend(item)) {
    console.log(`Skipped ${item.id}: buffer full`);
  }
}
```

**@param:** - The value to send

**@returns:** True if sent, false if buffer full

**@see:** {@link PriorityChannel.sendOrDrop} For drop-on-full with callback

*Source: [priority-channel.ts:417](packages/go-go-scope/src/priority-channel.ts#L417)*

---

### PriorityChannel.sendOrDrop

```typescript
PriorityChannel.sendOrDrop(value: T): void
```

Send a value or drop it if the buffer is full. If the buffer has space, inserts the value. If the buffer is full, calls the onDrop callback if configured.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `value` | `T` | - The value to send |

**Returns:** `void`

**Examples:**

```typescript
const channel = s.priorityChannel({
  capacity: 10,
  comparator: (a, b) => a.priority - b.priority,
  onDrop: (item) => metrics.increment('dropped_tasks')
});

// Send or drop
channel.sendOrDrop(lowPriorityTask);  // May be dropped if buffer full
channel.sendOrDrop(highPriorityTask); // May be dropped if buffer full

// Process important items without blocking
for (const event of events) {
  if (event.urgent) {
    await channel.send(event); // Block for urgent
  } else {
    channel.sendOrDrop(event); // Drop if full for non-urgent
  }
}
```

**@param:** - The value to send

**@see:** {@link PriorityChannel.send} For blocking send

*Source: [priority-channel.ts:463](packages/go-go-scope/src/priority-channel.ts#L463)*

---

### PriorityChannel.receive

```typescript
PriorityChannel.receive(): Promise<T | undefined>
```

Receive the highest priority value from the channel. Returns the highest priority item immediately if available. If the buffer is empty, blocks until an item is sent or the channel is closed.

**Returns:** `Promise<T | undefined>`

The highest priority item, or undefined if channel closed and empty

**Examples:**

```typescript
// Receive single item
const task = await channel.receive();
if (task) {
  await processTask(task);
}

// Receive until closed
while (true) {
  const item = await channel.receive();
  if (item === undefined) break;
  await process(item);
}
```

**@returns:** The highest priority item, or undefined if channel closed and empty

**@throws:** If the channel is aborted

**@see:** {@link PriorityChannel.peek} For viewing without removing

*Source: [priority-channel.ts:506](packages/go-go-scope/src/priority-channel.ts#L506)*

---

### PriorityChannel.tryReceive

```typescript
PriorityChannel.tryReceive(): T | undefined
```

Try to receive without blocking. Returns the highest priority value immediately if available, or undefined if the buffer is empty.

**Returns:** `T | undefined`

The highest priority item, or undefined if empty

**Examples:**

```typescript
// Process all available items
while (true) {
  const item = channel.tryReceive();
  if (!item) break;
  process(item);
}

// Check for work without blocking
const task = channel.tryReceive();
if (task) {
  await processTask(task);
} else {
  // Do other work
  await checkOtherQueues();
}
```

**@returns:** The highest priority item, or undefined if empty

**@see:** {@link PriorityChannel.peek} For viewing without removing

*Source: [priority-channel.ts:559](packages/go-go-scope/src/priority-channel.ts#L559)*

---

### PriorityChannel.peek

```typescript
PriorityChannel.peek(): T | undefined
```

Peek at the highest priority value without removing it.

**Returns:** `T | undefined`

The highest priority item, or undefined if empty

**Examples:**

```typescript
// Check next task without removing
const nextTask = channel.peek();
if (nextTask && nextTask.priority === 0) {
  console.log('Urgent task waiting!');
}

// Get priority of next item
const next = channel.peek();
if (next) {
  console.log(`Next priority: ${next.priority}`);
}
```

**@returns:** The highest priority item, or undefined if empty

**@see:** {@link PriorityChannel.tryReceive} For non-blocking removal

*Source: [priority-channel.ts:591](packages/go-go-scope/src/priority-channel.ts#L591)*

---

### PriorityChannel.close

```typescript
PriorityChannel.close(): void
```

Close the channel. No more sends are allowed after closing. Pending receives will get remaining values. Waiting senders will be rejected.

**Returns:** `void`

**Examples:**

```typescript
// Signal no more items
producerTask: async () => {
  for (const item of items) {
    await channel.send(item);
  }
  channel.close();
}

// Consumer knows when to stop
consumerTask: async () => {
  while (true) {
    const item = await channel.receive();
    if (item === undefined) break; // Channel closed
    await process(item);
  }
}
```

**@see:** {@link PriorityChannel. [Symbol.asyncDispose]} For cleanup

*Source: [priority-channel.ts:625](packages/go-go-scope/src/priority-channel.ts#L625)*

---

### PriorityChannel.notifyReceivers

```typescript
PriorityChannel.notifyReceivers(): void
```

Notify waiting receivers that items are available.

**Returns:** `void`

**@internal:** 

*Source: [priority-channel.ts:827](packages/go-go-scope/src/priority-channel.ts#L827)*

---

### PriorityChannel.processWaitingSenders

```typescript
PriorityChannel.processWaitingSenders(): void
```

Process waiting senders when space becomes available.

**Returns:** `void`

**@internal:** 

*Source: [priority-channel.ts:841](packages/go-go-scope/src/priority-channel.ts#L841)*

---

### PriorityChannel.drainQueues

```typescript
PriorityChannel.drainQueues(): void
```

Drain all queues on abort.

**Returns:** `void`

**@internal:** 

*Source: [priority-channel.ts:856](packages/go-go-scope/src/priority-channel.ts#L856)*

---

### ResourcePool.initialize

```typescript
ResourcePool.initialize(): Promise<void>
```

Initialize the pool with minimum resources. Called automatically on first acquire if not already initialized. Pre-warms the pool by creating resources up to the configured minimum.

**Returns:** `Promise<void>`

Resolves when minimum resources are created

**Examples:**

```typescript
const pool = s.resourcePool({
  create: () => createConnection(),
  destroy: (c) => c.close(),
  min: 5
});

// Pre-warm the pool before accepting requests
await pool.initialize();
console.log('Pool ready with 5 connections');
```

**@returns:** Resolves when minimum resources are created

**@throws:** If the pool has been disposed

*Source: [resource-pool.ts:226](packages/go-go-scope/src/resource-pool.ts#L226)*

---

### ResourcePool.acquire

```typescript
ResourcePool.acquire(): Promise<T>
```

Acquire a resource from the pool. Returns an available resource immediately if one exists. If no resources are available, creates a new one if under max capacity. Otherwise, blocks until a resource is returned or timeout occurs.

**Returns:** `Promise<T>`

A resource from the pool

**Examples:**

```typescript
const conn = await pool.acquire();
try {
  // Use the connection
  await conn.query('SELECT * FROM users');
} catch (err) {
  console.error('Query failed:', err);
} finally {
  // Always release back to pool
  await pool.release(conn);
}
```

**@returns:** A resource from the pool

**@throws:** If the parent scope was aborted

**@see:** {@link ResourcePool.execute} For automatic resource management

*Source: [resource-pool.ts:267](packages/go-go-scope/src/resource-pool.ts#L267)*

---

### ResourcePool.release

```typescript
ResourcePool.release(resource: T): Promise<void>
```

Release a resource back to the pool. The resource should have been acquired from this pool using {@link acquire}. If there are waiting acquirers, the resource is handed off immediately. Otherwise, it's returned to the available pool. If the pool has been disposed or aborted, the resource is destroyed instead of being returned to the pool.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `resource` | `T` | - The resource to release back to the pool |

**Returns:** `Promise<void>`

Resolves when the resource is released

**Examples:**

```typescript
const conn = await pool.acquire();
try {
  await conn.doWork();
} finally {
  // Release back to pool even if work fails
  await pool.release(conn);
}
```

**@param:** - The resource to release back to the pool

**@returns:** Resolves when the resource is released

**@see:** {@link ResourcePool.execute} For automatic acquire/release

*Source: [resource-pool.ts:336](packages/go-go-scope/src/resource-pool.ts#L336)*

---

### ResourcePool.execute

```typescript
ResourcePool.execute<R>(fn: (resource: T) => Promise<R>): Promise<R>
```

Execute a function with an acquired resource. Automatically acquires a resource, executes the provided function, and releases the resource back to the pool (even if the function throws). This is the recommended way to use pool resources as it ensures proper cleanup.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(resource: T) => Promise<R>` | - Function to execute with the acquired resource |

**Returns:** `Promise<R>`

Result of the function

**Examples:**

```typescript
const result = await pool.execute(async (resource) => {
  const data = await resource.fetchData();
  const processed = await processData(data);
  return processed;
});

// Resource is automatically released, even if an error occurs
```

**@template:** Return type of the function

**@param:** - Function to execute with the acquired resource

**@returns:** Result of the function

**@throws:** Any error thrown by the provided function

**@see:** {@link ResourcePool.release} For manual release

*Source: [resource-pool.ts:391](packages/go-go-scope/src/resource-pool.ts#L391)*

---

### ResourcePool.checkHealth

```typescript
ResourcePool.checkHealth(): Promise<number>
```

Manually trigger a health check on all resources. Iterates through all resources and runs the configured health check. Unhealthy resources are destroyed and replaced (if min pool size is set). This is called automatically if healthCheckInterval is configured.

**Returns:** `Promise<number>`

Number of unhealthy resources found and removed

**Examples:**

```typescript
// Check health manually before a critical operation
const unhealthyCount = await pool.checkHealth();
if (unhealthyCount > 0) {
  console.warn(`Removed ${unhealthyCount} unhealthy connections`);
}
```

**@returns:** Number of unhealthy resources found and removed

**@see:** {@link ResourcePoolOptions.healthCheckInterval} For automatic health checks

*Source: [resource-pool.ts:466](packages/go-go-scope/src/resource-pool.ts#L466)*

---

### ResourcePool.startHealthChecks

```typescript
ResourcePool.startHealthChecks(): void
```

Start periodic health checks.

**Returns:** `void`

**@internal:** Called by constructor when healthCheckInterval is configured

*Source: [resource-pool.ts:513](packages/go-go-scope/src/resource-pool.ts#L513)*

---

### ResourcePool.removeResource

```typescript
ResourcePool.removeResource(resource: T): Promise<void>
```

Remove a resource from the pool and destroy it.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `resource` | `T` |  |

**Returns:** `Promise<void>`

**@internal:** 

*Source: [resource-pool.ts:525](packages/go-go-scope/src/resource-pool.ts#L525)*

---

### Scope.task

```typescript
Scope.task<T, E extends Error = Error>(fnOrModule:
			| ((ctx: {
					services: Services;
					signal: AbortSignal;
					logger: Logger;
					context: Record<string, unknown>;
					checkpoint?: {
						save: (data: unknown) => Promise<void>;
						data?: unknown;
					};
					progress?: ProgressContext;
			  }) => Promise<T>)
			| import("./types.js").WorkerModuleSpec, options?: TaskOptions<E>): Task<Result<E, T>>
```

Spawns a task within this scope. Tasks are lazy - they don't start executing until awaited or `.then()` is called. When awaited, they return a Result tuple `[error, value]` where exactly one is defined. Receives a context object with services, signal, logger, context, checkpoint, and progress

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fnOrModule` | `| ((ctx: {
					services: Services;
					signal: AbortSignal;
					logger: Logger;
					context: Record<string, unknown>;
					checkpoint?: {
						save: (data: unknown) => Promise<void>;
						data?: unknown;
					};
					progress?: ProgressContext;
			  }) => Promise<T>)
			| import("./types.js").WorkerModuleSpec` | - Task function or WorkerModuleSpec for worker thread execution
Receives a context object with services, signal, logger, context, checkpoint, and progress |
| `options` (optional) | `TaskOptions<E>` | - Optional task configuration |

**Returns:** `Task<Result<E, T>>`

A Task that can be awaited for a Result tuple

**@typeParam:** E - The error type for typed error handling

**@param:** - OpenTelemetry tracing options with additional attributes

**@returns:** A Task that can be awaited for a Result tuple

*Source: [scope.ts:595](packages/go-go-scope/src/scope.ts#L595)*

---

### Scope.resumeTask

```typescript
Scope.resumeTask<T, E extends Error = Error>(taskId: string, fn: (ctx: {
			services: Services;
			signal: AbortSignal;
			logger: Logger;
			context: Record<string, unknown>;
			checkpoint?: { save: (data: unknown) => Promise<void>; data?: unknown };
			progress?: ProgressContext;
		}) => Promise<T>, options?: Omit<TaskOptions<E>, "id"> & {
			/** If true, throw an error if no checkpoint exists for this task ID */
			requireExisting?: boolean;
		}): Promise<Result<E, T>>
```

Resume a task from its last checkpoint. If a checkpoint exists for the task ID, the task will be executed with the checkpoint data available in the context.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `string` | - The unique task ID to resume |
| `fn` | `(ctx: {
			services: Services;
			signal: AbortSignal;
			logger: Logger;
			context: Record<string, unknown>;
			checkpoint?: { save: (data: unknown) => Promise<void>; data?: unknown };
			progress?: ProgressContext;
		}) => Promise<T>` | - The task function to execute |
| `options` (optional) | `Omit<TaskOptions<E>, "id"> & {
			/** If true, throw an error if no checkpoint exists for this task ID */
			requireExisting?: boolean;
		}` | - Optional task options |

**Returns:** `Promise<Result<E, T>>`

Promise that resolves to the task result

**Examples:**

```typescript
const [err, result] = await s.resumeTask('migration-job', async ({ checkpoint, progress }) => {
  // checkpoint.data contains the saved state
  const processed = checkpoint?.data?.processed ?? 0
  // Continue processing from checkpoint...
})
```

**@param:** - Optional task options

**@returns:** Promise that resolves to the task result

*Source: [scope.ts:1079](packages/go-go-scope/src/scope.ts#L1079)*

---

### Scope.parallel

```typescript
Scope.parallel<T extends readonly (() => Promise<unknown>)[]>(factories: T, options?: {
			concurrency?: number;
			onProgress?: (
				completed: number,
				total: number,
				result: Result<unknown, unknown>,
			) => void;
			continueOnError?: boolean;
		}): Promise<{
		[K in keyof T]: T[K] extends () => Promise<infer R>
			? Result<unknown, R>
			: never;
	}>
```

Run multiple tasks in parallel with optional concurrency limit. All tasks run within this scope and are cancelled together on failure.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `T` | - Array of factory functions that receive AbortSignal and create promises |
| `options` (optional) | `{
			concurrency?: number;
			onProgress?: (
				completed: number,
				total: number,
				result: Result<unknown, unknown>,
			) => void;
			continueOnError?: boolean;
		}` | - Optional configuration for parallel execution |

**Returns:** `Promise<{
		[K in keyof T]: T[K] extends () => Promise<infer R>
			? Result<unknown, R>
			: never;
	}>`

A Promise that resolves to a tuple of Results (one per factory)

**@typeParam:** T - Tuple type of factory functions

**@param:** - If true, continue running tasks even if some fail (default: false)

**@returns:** A Promise that resolves to a tuple of Results (one per factory)

*Source: [scope.ts:1147](packages/go-go-scope/src/scope.ts#L1147)*

---

### Scope.race

```typescript
Scope.race<T>(factories: readonly (() => Promise<T>)[], options?: {
			timeout?: number;
			requireSuccess?: boolean;
			concurrency?: number;
		}): Promise<Result<unknown, T>>
```

Race multiple tasks against each other - first to settle wins.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `readonly (() => Promise<T>)[]` | - Array of factory functions that receive AbortSignal and create promises |
| `options` (optional) | `{
			timeout?: number;
			requireSuccess?: boolean;
			concurrency?: number;
		}` | - Optional race configuration |

**Returns:** `Promise<Result<unknown, T>>`

A Promise that resolves to the Result of the winning task

**@typeParam:** T - The type of value returned by the task factories

**@param:** - Maximum concurrent tasks. When limit reached, new tasks start as others fail

**@returns:** A Promise that resolves to the Result of the winning task

*Source: [scope.ts:1290](packages/go-go-scope/src/scope.ts#L1290)*

---

### Scope.wrapError

```typescript
Scope.wrapError(error: unknown, options?: TaskOptions<Error>): unknown
```

Wrap error according to errorClass or systemErrorClass options. If no options provided, uses UnknownError for plain errors and non-Error values. AbortError is not wrapped - the raw reason is returned.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `error` | `unknown` |  |
| `options` (optional) | `TaskOptions<Error>` |  |

**Returns:** `unknown`

*Source: [scope.ts:1427](packages/go-go-scope/src/scope.ts#L1427)*

---

### Scope.setContext

```typescript
Scope.setContext(key: string, value: unknown): this
```

Set a context value that will be available to all tasks in this scope. Context values are inherited by child scopes.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - Context key |
| `value` | `unknown` | - Context value |

**Returns:** `this`

This scope for chaining

**Examples:**

```typescript
await using s = scope();

// Set context values dynamically
s.setContext('requestId', 'abc-123');
s.setContext('userId', 456);

// Access in tasks
s.task(({ context }) => {
  console.log(context.requestId); // 'abc-123'
  console.log(context.userId);    // 456
});
```

**@param:** - Context value

**@returns:** This scope for chaining

*Source: [scope.ts:1659](packages/go-go-scope/src/scope.ts#L1659)*

---

### Scope.getContext

```typescript
Scope.getContext<T = unknown>(key: string): T | undefined
```

Get a context value by key. Returns undefined if the key doesn't exist.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - Context key |

**Returns:** `T | undefined`

The context value or undefined

**Examples:**

```typescript
await using s = scope({ context: { requestId: 'abc-123' } });

// Get context value
const requestId = s.getContext('requestId');
console.log(requestId); // 'abc-123'

// Returns undefined for missing keys
const missing = s.getContext('nonexistent'); // undefined
```

**@param:** - Context key

**@returns:** The context value or undefined

*Source: [scope.ts:1686](packages/go-go-scope/src/scope.ts#L1686)*

---

### Scope.hasContext

```typescript
Scope.hasContext(key: string): boolean
```

Check if a context key exists.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - Context key |

**Returns:** `boolean`

True if the key exists in context

**@param:** - Context key

**@returns:** True if the key exists in context

*Source: [scope.ts:1696](packages/go-go-scope/src/scope.ts#L1696)*

---

### Scope.removeContext

```typescript
Scope.removeContext(key: string): boolean
```

Remove a context value by key.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `key` | `string` | - Context key to remove |

**Returns:** `boolean`

True if the key was removed, false if it didn't exist

**@param:** - Context key to remove

**@returns:** True if the key was removed, false if it didn't exist

*Source: [scope.ts:1706](packages/go-go-scope/src/scope.ts#L1706)*

---

### Scope.getAllContext

```typescript
Scope.getAllContext(): Readonly<Record<string, unknown>>
```

Get all context values as a readonly object.

**Returns:** `Readonly<Record<string, unknown>>`

Readonly copy of the context object

**@returns:** Readonly copy of the context object

*Source: [scope.ts:1719](packages/go-go-scope/src/scope.ts#L1719)*

---

### Scope.eventEmitter

```typescript
Scope.eventEmitter<Events extends Record<string, (...args: unknown[]) => void>>(): ScopedEventEmitter<Events>
```

Create a scoped EventEmitter with automatic cleanup. All listeners are automatically removed when the scope is disposed.

**Returns:** `ScopedEventEmitter<Events>`

**Examples:**

```typescript
await using s = scope();
const emitter = s.eventEmitter<{
  data: (chunk: string) => void;
  end: () => void;
}>();

emitter.on("data", (chunk) => console.log(chunk));
emitter.emit("data", "Hello!");
```

*Source: [scope.ts:1798](packages/go-go-scope/src/scope.ts#L1798)*

---

### Scope.acquireLock

```typescript
Scope.acquireLock(options?: LockOptions): Lock
```

Acquire a lock for exclusive or shared access. Automatically integrates with scope for cancellation and cleanup.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `LockOptions` |  |

**Returns:** `Lock`

**Examples:**

```typescript
// Exclusive lock (mutex)
await using s = scope()
const lock = s.acquireLock()
await using guard = await lock.acquire()
// Critical section
```

```typescript
// Read-Write lock
await using s = scope()
const lock = s.acquireLock({ allowMultipleReaders: true })
// Multiple concurrent reads
await using readGuard = await lock.read()
// Or exclusive write
await using writeGuard = await lock.write()
```

```typescript
// Distributed lock with Redis
await using s = scope({
  persistence: { lock: redisAdapter }
})
const lock = s.acquireLock({
  key: 'resource-lock',
  ttl: 30000
})
```

*Source: [scope.ts:1853](packages/go-go-scope/src/scope.ts#L1853)*

---

### Scope.poll

```typescript
Scope.poll<T>(fn: (signal: AbortSignal) => Promise<T>, onValue: (value: T) => void | Promise<void>, options?: import("./types.js").PollOptions): import("./types.js").PollController
```

Polls a function at regular intervals with structured concurrency.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(signal: AbortSignal) => Promise<T>` | - The async function to poll. Receives AbortSignal for cancellation |
| `onValue` | `(value: T) => void | Promise<void>` | - Callback invoked with each successful poll result. Can be async |
| `options` (optional) | `import("./types.js").PollOptions` | - Polling configuration options |

**Returns:** `import("./types.js").PollController`

A PollController for starting, stopping, and monitoring the poll

**@typeParam:** T - The type of value returned by the polled function

**@param:** - Optional AbortSignal to cancel polling

**@returns:** A PollController for starting, stopping, and monitoring the poll

*Source: [scope.ts:1883](packages/go-go-scope/src/scope.ts#L1883)*

---

### Scope.debounce

```typescript
Scope.debounce<T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>, options?: DebounceOptions): (...args: Args) => Promise<Result<unknown, T>>
```

Create a debounced function that delays invoking the provided function until after `wait` milliseconds have elapsed since the last time it was invoked. Automatically cancelled when the scope is disposed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(...args: Args) => Promise<T>` | - The function to debounce |
| `options` (optional) | `DebounceOptions` | - Debounce configuration options |

**Returns:** `(...args: Args) => Promise<Result<unknown, T>>`

A debounced function that returns a Promise<Result>

**@typeParam:** Args - The argument types of the debounced function

**@param:** - Trigger on the trailing edge (after wait period) (default: true)

**@returns:** A debounced function that returns a Promise<Result>

*Source: [scope.ts:1991](packages/go-go-scope/src/scope.ts#L1991)*

---

### Scope.throttle

```typescript
Scope.throttle<T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>, options?: ThrottleOptions): (...args: Args) => Promise<Result<unknown, T>>
```

Create a throttled function that only invokes the provided function at most once per every `wait` milliseconds. Automatically cancelled when the scope is disposed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(...args: Args) => Promise<T>` | - The function to throttle |
| `options` (optional) | `ThrottleOptions` | - Throttle configuration options |

**Returns:** `(...args: Args) => Promise<Result<unknown, T>>`

A throttled function that returns a Promise<Result>

**@typeParam:** Args - The argument types of the throttled function

**@param:** - Trigger on the trailing edge (after interval) (default: false)

**@returns:** A throttled function that returns a Promise<Result>

*Source: [scope.ts:2012](packages/go-go-scope/src/scope.ts#L2012)*

---

### Scope.delay

```typescript
Scope.delay(ms: number): Promise<void>
```

Delay execution for a specified number of milliseconds. Automatically cancelled when the scope is disposed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ms` | `number` | - Number of milliseconds to delay |

**Returns:** `Promise<void>`

Promise that resolves after the delay

**Examples:**

```typescript
await using s = scope()

console.log('Start')
await s.delay(1000)
console.log('After 1 second')
```

**@param:** - Number of milliseconds to delay

**@returns:** Promise that resolves after the delay

**@throws:** AbortError if the scope is cancelled during the delay

*Source: [scope.ts:2036](packages/go-go-scope/src/scope.ts#L2036)*

---

### Scope.batch

```typescript
Scope.batch<T, R>(options: BatchOptions<T, R>): Batch<T, R>
```

Create a batch processor that accumulates items and processes them in batches. Automatically flushes when batch is full or timeout is reached. Auto-flushes on scope disposal.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `BatchOptions<T, R>` | - Batch configuration options |

**Returns:** `Batch<T, R>`

Batch instance for adding items

**Examples:**

```typescript
await using s = scope()

const batcher = s.batch({
  size: 100,
  timeout: 5000,
  process: async (users) => {
    await db.users.insertMany(users)
    return users.length
  }
})

// Add items - they accumulate
await batcher.add({ name: 'Alice' })
await batcher.add({ name: 'Bob' })

// Manually flush when needed
const [err, count] = await batcher.flush()
```

**@typeParam:** R - The return type of the batch process function

**@param:** - Function to process a batch of items. Receives the batch array and should return a promise

**@returns:** Batch instance for adding items

*Source: [scope.ts:2090](packages/go-go-scope/src/scope.ts#L2090)*

---

### Scope.every

```typescript
Scope.every(intervalMs: number, fn: (ctx: { signal: AbortSignal }) => Promise<void>): () => void
```

Execute a function repeatedly at a fixed interval. Automatically cancelled when the scope is disposed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `intervalMs` | `number` | - Interval in milliseconds between executions |
| `fn` | `(ctx: { signal: AbortSignal }) => Promise<void>` | - Function to execute. Receives AbortSignal for cancellation. |

**Returns:** `() => void`

A function to stop the interval early

**Examples:**

```typescript
await using s = scope()

// Check for updates every 5 seconds
const stop = s.every(5000, async ({ signal }) => {
  const updates = await checkForUpdates({ signal })
  if (updates.length > 0) console.log('New updates:', updates)
})

// Stop manually if needed
stop()
```

**@param:** - Function to execute. Receives AbortSignal for cancellation.

**@returns:** A function to stop the interval early

*Source: [scope.ts:2116](packages/go-go-scope/src/scope.ts#L2116)*

---

### Scope.any

```typescript
Scope.any<T>(factories: readonly (() => Promise<T>)[], options?: { timeout?: number }): Promise<Result<unknown, T>>
```

Wait for the first successful result from multiple tasks. Similar to Promise.any but returns a Result tuple and cancels remaining tasks.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factories` | `readonly (() => Promise<T>)[]` | - Array of factory functions that create promises |
| `options` (optional) | `{ timeout?: number }` | - Optional timeout |

**Returns:** `Promise<Result<unknown, T>>`

Result tuple with first success, or aggregate error if all fail

**Examples:**

```typescript
await using s = scope()

// Try multiple sources, get first successful response
const [err, response] = await s.any([
  () => fetchFromPrimary(),
  () => fetchFromBackup1(),
  () => fetchFromBackup2(),
])
```

**@param:** - Optional timeout

**@returns:** Result tuple with first success, or aggregate error if all fail

*Source: [scope.ts:2176](packages/go-go-scope/src/scope.ts#L2176)*

---

### Scope.metrics

```typescript
Scope.metrics(): undefined
```

Get metrics for the scope. NOTE: Metrics have been moved to @go-go-scope/plugin-metrics. This method returns undefined. Install the metrics plugin to get metrics.

**Returns:** `undefined`

**@go-go-scope:** /plugin-metrics.
This method returns undefined. Install the metrics plugin to get metrics.

*Source: [scope.ts:2238](packages/go-go-scope/src/scope.ts#L2238)*

---

### Scope.memoryUsage

```typescript
Scope.memoryUsage(): MemoryUsage | undefined
```

Get current memory usage information. Returns the current heap usage and limit information.

**Returns:** `MemoryUsage | undefined`

MemoryUsage object or undefined if memory monitoring is not available

**Examples:**

```typescript
await using s = scope({ memoryLimit: '100mb' });

const usage = s.memoryUsage();
if (usage) {
  console.log(`Using ${usage.used} bytes (${usage.percentageUsed.toFixed(1)}%)`);
}
```

**@returns:** MemoryUsage object or undefined if memory monitoring is not available

*Source: [scope.ts:2258](packages/go-go-scope/src/scope.ts#L2258)*

---

### Scope.setMemoryLimit

```typescript
Scope.setMemoryLimit(limit: number | string): void
```

Update the memory limit for this scope. Only works if memory monitoring was enabled at creation.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `limit` | `number | string` | - New memory limit (bytes or string like '100mb') |

**Returns:** `void`

**Examples:**

```typescript
await using s = scope({ memoryLimit: '100mb' });

// Increase limit dynamically
s.setMemoryLimit('200mb');
```

**@param:** - New memory limit (bytes or string like '100mb')

*Source: [scope.ts:2298](packages/go-go-scope/src/scope.ts#L2298)*

---

### Scope.onBeforeTask

```typescript
Scope.onBeforeTask(fn: (name: string, index: number, options?: TaskOptions) => void): void
```

Register a callback to be called before each task starts. Useful for plugins to track task execution.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(name: string, index: number, options?: TaskOptions) => void` |  |

**Returns:** `void`

*Source: [scope.ts:2318](packages/go-go-scope/src/scope.ts#L2318)*

---

### Scope.onAfterTask

```typescript
Scope.onAfterTask(fn: (
			name: string,
			duration: number,
			error?: unknown,
			index?: number,
		) => void): void
```

Register a callback to be called after each task completes. Useful for plugins to track task execution.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(
			name: string,
			duration: number,
			error?: unknown,
			index?: number,
		) => void` |  |

**Returns:** `void`

*Source: [scope.ts:2328](packages/go-go-scope/src/scope.ts#L2328)*

---

### Scope.createChild

```typescript
Scope.createChild<ChildServices extends Record<string, unknown> = Record<string, never>>(options?: Omit<ScopeOptions<Services>, "parent"> & {
			provide?: {
				[K in keyof ChildServices]: (ctx: {
					services: Services;
				}) => ChildServices[K] | Promise<ChildServices[K]>;
			};
		}): Scope<Services & ChildServices>
```

Create a child scope that inherits from this scope. The child scope inherits signal, services, and traceId from the parent.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `Omit<ScopeOptions<Services>, "parent"> & {
			provide?: {
				[K in keyof ChildServices]: (ctx: {
					services: Services;
				}) => ChildServices[K] | Promise<ChildServices[K]>;
			};
		}` |  |

**Returns:** `Scope<Services & ChildServices>`

**Examples:**

```typescript
await using parent = scope({ name: 'parent' });
const child = parent.createChild({ name: 'child' });
const grandchild = child.createChild({ name: 'grandchild' });
```

*Source: [scope.ts:2358](packages/go-go-scope/src/scope.ts#L2358)*

---

### Scope.debugTree

```typescript
Scope.debugTree(options: { format?: "ascii" | "mermaid"; includeStats?: boolean } = {}): string
```

Generate a visual tree representation of the scope hierarchy. Supports ASCII and Mermaid diagram formats.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `{ format?: "ascii" | "mermaid"; includeStats?: boolean }` |  |

**Returns:** `string`

**Examples:**

```typescript
await using s = scope({ name: 'root' });
const child = s.createChild({ name: 'child' });
const grandchild = child.createChild({ name: 'grandchild' });

console.log(s.debugTree());
// Output:
// 📦 root (id: 1)
//    ├─ 📦 child (id: 2)
//    │  └─ 📦 grandchild (id: 3)
//
console.log(s.debugTree({ format: 'mermaid' }));
// Output:
// graph TD
//     scope_1[📦 root]
//     scope_1 --> scope_2[📦 child]
//     scope_2 --> scope_3[📦 grandchild]
```

*Source: [scope.ts:2403](packages/go-go-scope/src/scope.ts#L2403)*

---

### Semaphore.acquire

```typescript
Semaphore.acquire<T>(fn: () => Promise<T>, priority = 0): Promise<T>
```

Acquire a permit and execute the function. Blocks if no permits are available until one becomes free. The permit is automatically released when the function completes (whether successful or not).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `() => Promise<T>` | - Function to execute with the permit |
| `priority` (optional) | `unknown` | - Higher priority tasks are processed first (default: 0) |

**Returns:** `Promise<T>`

Promise that resolves to the function's return value

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(2);

// High priority task (processed before lower priority)
const criticalResult = await sem.acquire(
  () => processCriticalData(),
  10 // High priority
);

// Normal priority task
const normalResult = await sem.acquire(
  () => processNormalData(),
  0 // Default priority
);
```

**@typeParam:** T - Return type of the function

**@param:** - Higher priority tasks are processed first (default: 0)

**@returns:** Promise that resolves to the function's return value

**@throws:** If the scope is aborted while waiting

**@see:** {@link execute} for an alias of this method

*Source: [semaphore.ts:154](packages/go-go-scope/src/semaphore.ts#L154)*

---

### Semaphore.execute

```typescript
Semaphore.execute<T>(fn: () => Promise<T>): Promise<T>
```

Execute a function with an acquired permit. Alias for {@link acquire}. Use whichever method name reads better in your code context.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `() => Promise<T>` | - Function to execute with the permit |

**Returns:** `Promise<T>`

Promise that resolves to the function's return value

**Examples:**

```typescript
await using s = scope();
const rateLimiter = new Semaphore(10);

// Execute API calls with rate limiting
const result = await rateLimiter.execute(async () => {
  const response = await fetch('/api/data');
  return await response.json();
});
```

**@typeParam:** T - Return type of the function

**@param:** - Function to execute with the permit

**@returns:** Promise that resolves to the function's return value

**@throws:** If the scope is aborted while waiting

*Source: [semaphore.ts:186](packages/go-go-scope/src/semaphore.ts#L186)*

---

### Semaphore.tryAcquire

```typescript
Semaphore.tryAcquire(): boolean
```

Try to acquire a permit without blocking. Returns immediately, indicating whether a permit was acquired. Use this when you want to fail fast rather than wait.

**Returns:** `boolean`

true if permit was acquired, false otherwise

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(1);

// First acquire succeeds
if (sem.tryAcquire()) {
  console.log('Got permit!');
  // ... do work ...
  sem.release(); // Must manually release
}

// Second acquire fails immediately (no waiting)
if (!sem.tryAcquire()) {
  console.log('No permit available, doing something else...');
}
```

**@returns:** true if permit was acquired, false otherwise

**@see:** {@link tryAcquireWithFn} for automatic release after execution

*Source: [semaphore.ts:218](packages/go-go-scope/src/semaphore.ts#L218)*

---

### Semaphore.tryAcquireWithFn

```typescript
Semaphore.tryAcquireWithFn<T>(fn: () => Promise<T>): Promise<T | undefined>
```

Try to acquire a permit and execute a function. If a permit is available, executes the function and returns its result. If no permit is available, returns undefined immediately without waiting.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `() => Promise<T>` | - Function to execute if permit is acquired |

**Returns:** `Promise<T | undefined>`

Promise that resolves to the function's return value, or undefined if no permit was available

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(3);

// Try to process with rate limiting
const result = await sem.tryAcquireWithFn(async () => {
  return await expensiveOperation();
});

if (result === undefined) {
  console.log('System busy, request queued for later');
} else {
  console.log('Result:', result);
}
```

**@typeParam:** T - Return type of the function

**@param:** - Function to execute if permit is acquired

**@returns:** Promise that resolves to the function's return value, or undefined if no permit was available

*Source: [semaphore.ts:258](packages/go-go-scope/src/semaphore.ts#L258)*

---

### Semaphore.acquireWithTimeout

```typescript
Semaphore.acquireWithTimeout(timeoutMs: number): Promise<boolean>
```

Acquire a permit with a timeout. Waits up to the specified timeout for a permit to become available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `timeoutMs` | `number` | - Maximum time to wait in milliseconds |

**Returns:** `Promise<boolean>`

Promise that resolves to true if permit was acquired, false if timeout was reached

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(1);

// Hold the only permit
await sem.acquire(async () => {
  await sleep(5000); // Hold for 5 seconds
});

// Try to acquire with 1 second timeout (will fail)
const acquired = await sem.acquireWithTimeout(1000);
console.log(acquired); // false (timeout)
```

**@param:** - Maximum time to wait in milliseconds

**@returns:** Promise that resolves to true if permit was acquired, false if timeout was reached

*Source: [semaphore.ts:292](packages/go-go-scope/src/semaphore.ts#L292)*

---

### Semaphore.acquireWithTimeoutAndFn

```typescript
Semaphore.acquireWithTimeoutAndFn<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T | undefined>
```

Acquire a permit with timeout and execute a function. If the timeout is reached before a permit becomes available, returns undefined without executing the function.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `timeoutMs` | `number` | - Maximum time to wait in milliseconds |
| `fn` | `() => Promise<T>` | - Function to execute if permit is acquired |

**Returns:** `Promise<T | undefined>`

Promise that resolves to the function's return value, or undefined if timeout was reached

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(1);

const result = await sem.acquireWithTimeoutAndFn(
  5000, // Wait up to 5 seconds
  async () => {
    return await fetchCriticalData();
  }
);

if (result === undefined) {
  console.log('Could not acquire permit in time');
} else {
  console.log('Data:', result);
}
```

**@typeParam:** T - Return type of the function

**@param:** - Function to execute if permit is acquired

**@returns:** Promise that resolves to the function's return value, or undefined if timeout was reached

*Source: [semaphore.ts:362](packages/go-go-scope/src/semaphore.ts#L362)*

---

### Semaphore.bulkAcquire

```typescript
Semaphore.bulkAcquire<T>(count: number, fn: () => Promise<T>): Promise<T>
```

Acquire multiple permits at once. Blocks until all requested permits are available. Useful when a task needs exclusive access or multiple resources.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `count` | `number` | - Number of permits to acquire |
| `fn` | `() => Promise<T>` | - Function to execute with the permits |

**Returns:** `Promise<T>`

Promise that resolves to the function's return value

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(5);

// Need 3 permits for a batch operation
const result = await sem.bulkAcquire(3, async () => {
  // We hold 3 permits, so only 2 are available to others
  return await processBatch(largeDataset);
});
```

**@typeParam:** T - Return type of the function

**@param:** - Function to execute with the permits

**@returns:** Promise that resolves to the function's return value

**@throws:** If count is not positive or exceeds total permits

*Source: [semaphore.ts:400](packages/go-go-scope/src/semaphore.ts#L400)*

---

### Semaphore.tryBulkAcquire

```typescript
Semaphore.tryBulkAcquire(count: number): boolean
```

Try to acquire multiple permits without blocking. Returns immediately, indicating whether the permits were acquired.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `count` | `number` | - Number of permits to acquire |

**Returns:** `boolean`

true if permits were acquired, false otherwise

**Examples:**

```typescript
await using s = scope();
const sem = new Semaphore(5);

// Try to get 3 permits
if (sem.tryBulkAcquire(3)) {
  console.log('Got 3 permits!');
  // ... do work ...
  sem.releaseMultiple(3);
} else {
  console.log('Not enough permits available');
}
```

**@param:** - Number of permits to acquire

**@returns:** true if permits were acquired, false otherwise

**@throws:** If count is not positive or exceeds total permits

*Source: [semaphore.ts:442](packages/go-go-scope/src/semaphore.ts#L442)*

---

### Semaphore.wait

```typescript
Semaphore.wait(priority = 0): Promise<void>
```

Wait for a permit to become available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `priority` (optional) | `unknown` | - Higher priority tasks are processed first (default: 0) |

**Returns:** `Promise<void>`

Promise that resolves when a permit is acquired

**@param:** - Higher priority tasks are processed first (default: 0)

**@returns:** Promise that resolves when a permit is acquired

**@throws:** If the scope is aborted

**@internal:** 

*Source: [semaphore.ts:470](packages/go-go-scope/src/semaphore.ts#L470)*

---

### Semaphore.release

```typescript
Semaphore.release(): void
```

Release a permit. If there are waiting tasks, the permit is given to the highest priority waiter. Otherwise, it becomes available for future acquires.

**Returns:** `void`

**@internal:** 

*Source: [semaphore.ts:511](packages/go-go-scope/src/semaphore.ts#L511)*

---

### Semaphore.waitForMultiple

```typescript
Semaphore.waitForMultiple(count: number): Promise<void>
```

Wait for multiple permits to become available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `count` | `number` | - Number of permits to wait for |

**Returns:** `Promise<void>`

Promise that resolves when all permits are acquired

**@param:** - Number of permits to wait for

**@returns:** Promise that resolves when all permits are acquired

**@throws:** If the scope is aborted

**@internal:** 

*Source: [semaphore.ts:531](packages/go-go-scope/src/semaphore.ts#L531)*

---

### Semaphore.releaseMultiple

```typescript
Semaphore.releaseMultiple(count: number): void
```

Release multiple permits.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `count` | `number` | - Number of permits to release |

**Returns:** `void`

**@param:** - Number of permits to release

**@internal:** 

*Source: [semaphore.ts:567](packages/go-go-scope/src/semaphore.ts#L567)*

---

### Semaphore.drainQueue

```typescript
Semaphore.drainQueue(): void
```

Drain the queue, rejecting all pending acquires.

**Returns:** `void`

**@internal:** 

*Source: [semaphore.ts:649](packages/go-go-scope/src/semaphore.ts#L649)*

---

### SharedWorkerModule.initialize

```typescript
SharedWorkerModule.initialize(options?: SharedWorkerOptions): Promise<void>
```

Initialize the shared worker by importing and validating the module. Called automatically by createSharedWorker, but can be called manually for lazy initialization.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `SharedWorkerOptions` |  |

**Returns:** `Promise<void>`

*Source: [shared-worker.ts:54](packages/go-go-scope/src/shared-worker.ts#L54)*

---

### SharedWorkerModule.export

```typescript
SharedWorkerModule.export(exportName = "default"): WorkerModuleSpec
```

Get a WorkerModuleSpec for a specific export. The returned spec can be passed to scope.task() for worker execution.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `exportName` (optional) | `unknown` | - Name of the export to use (default: 'default') |

**Returns:** `WorkerModuleSpec`

WorkerModuleSpec configured for this shared module

**@param:** - Name of the export to use (default: 'default')

**@returns:** WorkerModuleSpec configured for this shared module

*Source: [shared-worker.ts:82](packages/go-go-scope/src/shared-worker.ts#L82)*

---

### SharedWorkerModule.getAvailableExports

```typescript
SharedWorkerModule.getAvailableExports(): string[]
```

Get all available function exports from the module. Requires initialize() to be called first.

**Returns:** `string[]`

*Source: [shared-worker.ts:106](packages/go-go-scope/src/shared-worker.ts#L106)*

---

### SharedWorkerModule.hasExport

```typescript
SharedWorkerModule.hasExport(exportName: string): boolean
```

Check if a specific export exists and is a function. Requires initialize() to be called first.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `exportName` | `string` |  |

**Returns:** `boolean`

*Source: [shared-worker.ts:122](packages/go-go-scope/src/shared-worker.ts#L122)*

---

### Task.setupAbortController

```typescript
Task.setupAbortController(): void
```

Setup AbortController and link to parent signal. Called lazily when signal is accessed or task starts.

**Returns:** `void`

**@internal:** 

*Source: [task.ts:229](packages/go-go-scope/src/task.ts#L229)*

---

### Task.start

```typescript
Task.start(): Promise<T>
```

Start the task execution if not already started. Optimized to minimize microtask overhead. This is called automatically when the task is awaited or `.then()` is called.

**Returns:** `Promise<T>`

**@internal:** 

*Source: [task.ts:336](packages/go-go-scope/src/task.ts#L336)*

---

### Task.then

```typescript
Task.then<TResult1 = T, TResult2 = never>(onfulfilled?:
			| ((value: T) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined, onrejected?:
			| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
			| null
			| undefined): Promise<TResult1 | TResult2>
```

Attaches callbacks for the resolution and/or rejection of the task. Implements the PromiseLike interface. Calling this method starts task execution if it hasn't started yet. // biome-ignore lint/suspicious/noThenProperty: Intentionally implementing PromiseLike

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `onfulfilled` (optional) | `| ((value: T) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined` | - Optional callback to execute when the task resolves |
| `onrejected` (optional) | `| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
			| null
			| undefined` | - Optional callback to execute when the task rejects |

**Returns:** `Promise<TResult1 | TResult2>`

A Promise for the completion of the callback

**Examples:**

```typescript
await using s = scope();

const task = s.task(() => fetchData());

const result = await task.then(
  ([err, data]) => {
    if (err) throw err;
    return processData(data);
  },
  (error) => {
    console.error('Failed:', error);
    return defaultValue;
  }
);
```

**@typeParam:** TResult2 - The type of the value returned from the onrejected callback

**@param:** - Optional callback to execute when the task rejects

**@returns:** A Promise for the completion of the callback

*Source: [task.ts:409](packages/go-go-scope/src/task.ts#L409)*

---

### Task.catch

```typescript
Task.catch<TResult = never>(onrejected?:
			| ((reason: unknown) => TResult | PromiseLike<TResult>)
			| null
			| undefined): Promise<T | TResult>
```

Attaches a callback for only the rejection of the task. Convenience method equivalent to `.then(undefined, onrejected)`. Calling this method starts task execution if it hasn't started yet.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `onrejected` (optional) | `| ((reason: unknown) => TResult | PromiseLike<TResult>)
			| null
			| undefined` | - Callback to execute when the task rejects |

**Returns:** `Promise<T | TResult>`

A Promise for the completion of the callback

**Examples:**

```typescript
await using s = scope();

const task = s.task(() => fetchData());

const result = await task.catch(error => {
  console.error('Fetch failed:', error);
  return defaultData;
});
```

**@typeParam:** TResult - The type of the value returned from the onrejected callback

**@param:** - Callback to execute when the task rejects

**@returns:** A Promise for the completion of the callback

*Source: [task.ts:444](packages/go-go-scope/src/task.ts#L444)*

---

### Task.finally

```typescript
Task.finally(onfinally?: (() => void) | null | undefined): Promise<T>
```

Attaches a callback that is invoked when the task settles (resolves or rejects). Convenience method equivalent to `.then(onfinally, onfinally)`. The callback receives no arguments - it doesn't matter if the task succeeded or failed. Calling this method starts task execution if it hasn't started yet.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `onfinally` (optional) | `(() => void) | null | undefined` | - Callback to execute when the task settles |

**Returns:** `Promise<T>`

A Promise for the completion of the callback

**Examples:**

```typescript
await using s = scope();

const task = s.task(() => fetchData());

const result = await task.finally(() => {
  console.log('Task finished (success or failure)');
  cleanupResources();
});
```

**@param:** - Callback to execute when the task settles

**@returns:** A Promise for the completion of the callback

*Source: [task.ts:477](packages/go-go-scope/src/task.ts#L477)*

---

### TokenBucket.getTokens

```typescript
TokenBucket.getTokens(): Promise<number>
```

Get the current number of tokens available. Automatically refills tokens based on elapsed time since last check. In distributed mode, retrieves state from the cache provider.

**Returns:** `Promise<number>`

Current token count (0 to capacity)

**Examples:**

```typescript
const tokens = await bucket.getTokens();
console.log(`Available tokens: ${tokens}/${bucket.capacity}`);

if (tokens >= 5) {
  // We have enough tokens for a batch operation
}
```

**@returns:** Current token count (0 to capacity)

**@see:** {@link TokenBucket.getState} For full state including capacity and rate

*Source: [token-bucket.ts:169](packages/go-go-scope/src/token-bucket.ts#L169)*

---

### TokenBucket.tryConsume

```typescript
TokenBucket.tryConsume(tokens = 1): Promise<boolean>
```

Try to consume tokens without blocking. Returns true if tokens were consumed, false otherwise. Does not wait for tokens to become available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` (optional) | `unknown` | - Number of tokens to consume (default: 1) |

**Returns:** `Promise<boolean>`

True if tokens were consumed

**Examples:**

```typescript
// Check if we can make a request without blocking
if (await bucket.tryConsume(1)) {
  await makeApiCall();
} else {
  // Rate limited - skip or queue for later
  console.log('Rate limited, skipping request');
}

// Consume multiple tokens for a batch operation
if (await bucket.tryConsume(10)) {
  await processBatch(10);
}
```

**@param:** - Number of tokens to consume (default: 1)

**@returns:** True if tokens were consumed

**@see:** {@link TokenBucket.acquireWithTimeout} For blocking with timeout

*Source: [token-bucket.ts:205](packages/go-go-scope/src/token-bucket.ts#L205)*

---

### TokenBucket.acquire

```typescript
TokenBucket.acquire<T>(tokens: number, fn: () => Promise<T>): Promise<T>
```

Acquire tokens and execute a function. Blocks until the required tokens are available, then executes the provided function. The tokens are consumed before the function executes.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` | `number` | - Number of tokens to acquire |
| `fn` | `() => Promise<T>` | - Function to execute after acquiring tokens |

**Returns:** `Promise<T>`

Result of the function

**Examples:**

```typescript
// Execute an API call with rate limiting
const result = await bucket.acquire(1, async () => {
  return await fetchUserData(userId);
});

// Batch processing with higher token cost
await bucket.acquire(5, async () => {
  await processBatch(items);
});
```

**@template:** Return type of the function

**@param:** - Function to execute after acquiring tokens

**@returns:** Result of the function

**@see:** {@link TokenBucket.tryConsume} For non-blocking consume

*Source: [token-bucket.ts:240](packages/go-go-scope/src/token-bucket.ts#L240)*

---

### TokenBucket.acquireWithTimeout

```typescript
TokenBucket.acquireWithTimeout<T>(tokens: number, timeoutMs: number, fn: () => Promise<T>): Promise<T | undefined>
```

Acquire tokens with a timeout. Attempts to acquire tokens within the specified timeout. Returns undefined if timeout is reached before tokens are available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` | `number` | - Number of tokens to acquire |
| `timeoutMs` | `number` | - Timeout in milliseconds |
| `fn` | `() => Promise<T>` | - Function to execute after acquiring tokens |

**Returns:** `Promise<T | undefined>`

Result of the function, or undefined if timeout

**Examples:**

```typescript
// Try to acquire with 1 second timeout
const result = await bucket.acquireWithTimeout(
  1,
  1000,
  async () => await fetchData()
);

if (result === undefined) {
  console.log('Request timed out due to rate limiting');
} else {
  console.log('Data received:', result);
}
```

**@template:** Return type of the function

**@param:** - Function to execute after acquiring tokens

**@returns:** Result of the function, or undefined if timeout

**@see:** {@link TokenBucket.tryConsume} For immediate non-blocking attempt

*Source: [token-bucket.ts:276](packages/go-go-scope/src/token-bucket.ts#L276)*

---

### TokenBucket.reset

```typescript
TokenBucket.reset(): Promise<void>
```

Reset the bucket to full capacity. Sets tokens to capacity and updates the last refill time. In distributed mode, updates the state in the cache.

**Returns:** `Promise<void>`

Resolves when reset is complete

**Examples:**

```typescript
// Reset after a rate limit error from upstream
try {
  await makeApiCall();
} catch (err) {
  if (isRateLimitError(err)) {
    // Reset our bucket to sync with upstream
    await bucket.reset();
  }
}

// Manual reset for testing
await bucket.reset();
expect(await bucket.getTokens()).toBe(100);
```

**@returns:** Resolves when reset is complete

**@see:** {@link TokenBucket.getTokens} For checking current tokens

*Source: [token-bucket.ts:313](packages/go-go-scope/src/token-bucket.ts#L313)*

---

### TokenBucket.getState

```typescript
TokenBucket.getState(): Promise<{
		tokens: number;
		capacity: number;
		refillRate: number;
	}>
```

Get the current bucket state. Returns the current token count along with capacity and refill rate. Tokens are refilled before returning the state.

**Returns:** `Promise<{
		tokens: number;
		capacity: number;
		refillRate: number;
	}>`

Current bucket state

**Examples:**

```typescript
const state = await bucket.getState();
console.log(`Tokens: ${state.tokens}/${state.capacity}`);
console.log(`Refill rate: ${state.refillRate}/sec`);

const usagePercent = (state.tokens / state.capacity) * 100;
if (usagePercent < 10) {
  console.warn('Token bucket nearly empty!');
}
```

**@returns:** returns.refillRate Tokens added per second

**@see:** {@link TokenBucket.getTokens} For just the token count

*Source: [token-bucket.ts:347](packages/go-go-scope/src/token-bucket.ts#L347)*

---

### TokenBucket.refill

```typescript
TokenBucket.refill(): void
```

Refill tokens based on elapsed time.

**Returns:** `void`

**@internal:** 

*Source: [token-bucket.ts:365](packages/go-go-scope/src/token-bucket.ts#L365)*

---

### TokenBucket.tryConsumeLocal

```typescript
TokenBucket.tryConsumeLocal(tokens: number): boolean
```

Try to consume tokens locally.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` | `number` |  |

**Returns:** `boolean`

**@internal:** 

*Source: [token-bucket.ts:379](packages/go-go-scope/src/token-bucket.ts#L379)*

---

### TokenBucket.waitForTokens

```typescript
TokenBucket.waitForTokens(tokens: number): Promise<void>
```

Wait for tokens to become available.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` | `number` |  |

**Returns:** `Promise<void>`

**@internal:** Blocks until tokens are available

*Source: [token-bucket.ts:393](packages/go-go-scope/src/token-bucket.ts#L393)*

---

### TokenBucket.waitForTokensWithTimeout

```typescript
TokenBucket.waitForTokensWithTimeout(tokens: number, timeoutMs: number): Promise<boolean>
```

Wait for tokens with timeout.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` | `number` |  |
| `timeoutMs` | `number` |  |

**Returns:** `Promise<boolean>`

True if tokens were acquired, false if timeout

**@internal:** 

**@returns:** True if tokens were acquired, false if timeout

*Source: [token-bucket.ts:410](packages/go-go-scope/src/token-bucket.ts#L410)*

---

### TokenBucket.getDistributedTokens

```typescript
TokenBucket.getDistributedTokens(): Promise<number>
```

// Distributed implementation using cache provider Get tokens from distributed cache.

**Returns:** `Promise<number>`

**@internal:** 

*Source: [token-bucket.ts:436](packages/go-go-scope/src/token-bucket.ts#L436)*

---

### TokenBucket.tryConsumeDistributed

```typescript
TokenBucket.tryConsumeDistributed(tokens: number): Promise<boolean>
```

Try to consume tokens in distributed mode.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokens` | `number` |  |

**Returns:** `Promise<boolean>`

**@internal:** 

*Source: [token-bucket.ts:459](packages/go-go-scope/src/token-bucket.ts#L459)*

---

### TokenBucket.resetDistributed

```typescript
TokenBucket.resetDistributed(): Promise<void>
```

Reset bucket in distributed mode.

**Returns:** `Promise<void>`

**@internal:** 

*Source: [token-bucket.ts:483](packages/go-go-scope/src/token-bucket.ts#L483)*

---

### WorkerPool.execute

```typescript
WorkerPool.execute<T, R>(fn: (data: T) => R, data: T, transferList?: Transferable[]): Promise<R>
```

Execute a function in a worker thread. If no workers are available, queues the task.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fn` | `(data: T) => R` |  |
| `data` | `T` |  |
| `transferList` (optional) | `Transferable[]` |  |

**Returns:** `Promise<R>`

*Source: [worker-pool.ts:158](packages/go-go-scope/src/worker-pool.ts#L158)*

---

### WorkerPool.executeModule

```typescript
WorkerPool.executeModule<R>(modulePath: string, exportName: string, data: unknown, transferList?: Transferable[], options?: { validate?: boolean; cache?: boolean; sourceMap?: boolean }): Promise<R>
```

Execute a function from a module file in a worker thread. The module is loaded by the worker, not serialized.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `modulePath` | `string` | - Path to the module file |
| `exportName` | `string` | - Name of the export to use (default: 'default') |
| `data` | `unknown` | - Data to pass to the function |
| `transferList` (optional) | `Transferable[]` | - Optional transfer list for zero-copy |
| `options` (optional) | `{ validate?: boolean; cache?: boolean; sourceMap?: boolean }` | - Additional options for module execution |

**Returns:** `Promise<R>`

**@param:** - Additional options for module execution

*Source: [worker-pool.ts:202](packages/go-go-scope/src/worker-pool.ts#L202)*

---

### WorkerPool.validateModule

```typescript
WorkerPool.validateModule(modulePath: string, exportName: string): Promise<void>
```

Validate that a module exists and the specified export is callable. Throws descriptive errors for common issues.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `modulePath` | `string` |  |
| `exportName` | `string` |  |

**Returns:** `Promise<void>`

*Source: [worker-pool.ts:251](packages/go-go-scope/src/worker-pool.ts#L251)*

---

### WorkerPool.executeBatch

```typescript
WorkerPool.executeBatch<T, R>(items: T[], fn: (data: T) => R, options: { ordered?: boolean } = {}): Promise<Result<Error, R>[]>
```

Execute multiple tasks in parallel using the worker pool. Maintains order by default.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `items` | `T[]` |  |
| `fn` | `(data: T) => R` |  |
| `options` (optional) | `{ ordered?: boolean }` |  |

**Returns:** `Promise<Result<Error, R>[]>`

*Source: [worker-pool.ts:300](packages/go-go-scope/src/worker-pool.ts#L300)*

---

### WorkerPool.stats

```typescript
WorkerPool.stats(): {
		total: number;
		busy: number;
		idle: number;
		pending: number;
	}
```

Get current pool statistics

**Returns:** `{
		total: number;
		busy: number;
		idle: number;
		pending: number;
	}`

*Source: [worker-pool.ts:354](packages/go-go-scope/src/worker-pool.ts#L354)*

---

