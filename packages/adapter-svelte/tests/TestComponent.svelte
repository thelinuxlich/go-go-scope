<script lang="ts">
  import {
    createScope,
    createTask,
    createParallel,
    createChannel,
    createBroadcast,
    createPolling
  } from "../src/index.js";

  export let testType: string;
  export let onDispose: () => void = () => {};
  export let onBroadcast: (msg: string) => void = () => {};

  // Create all possible stores at top level
  const scope = createScope({ name: "test" });
  scope.onDispose(onDispose);

  const task = createTask(async () => "fetched-data", { immediate: true });
  const manualTask = createTask(async () => "result-1", { immediate: false });
  const errorTask = createTask(async () => { throw new Error("Task failed"); }, { immediate: false });

  const delays = [50, 30, 70];
  const factories = delays.map((delay, i) => async () => {
    await new Promise(r => setTimeout(r, delay));
    return `task-${i}`;
  });
  const parallel = createParallel(factories, { immediate: true });

  const ch = createChannel<string>();
  const chClose = createChannel<string>();

  const bus = createBroadcast<string>();
  bus.subscribe((msg) => onBroadcast(msg));

  let pollCount1 = 0;
  const poller = createPolling(async () => {
    pollCount1++;
    return `poll-${pollCount1}`;
  }, { interval: 1000, immediate: true });
  
  let pollCount2 = 0;
  const pollerStop = createPolling(async () => {
    pollCount2++;
    return `poll-${pollCount2}`;
  }, { interval: 1000, immediate: true });

  // Subscribe to store values individually
  let scopeActiveVal = false;
  scope.isActive.subscribe(v => scopeActiveVal = v);
  $: scopeActive = String(scopeActiveVal);

  let taskDataVal: string | undefined;
  task.data.subscribe(v => taskDataVal = v);
  $: taskData = taskDataVal ?? "no-data";

  let taskLoadingVal = false;
  task.isLoading.subscribe(v => taskLoadingVal = v);
  $: taskLoading = String(taskLoadingVal);

  let manualTaskDataVal: string | undefined;
  manualTask.data.subscribe(v => manualTaskDataVal = v);
  $: manualTaskData = manualTaskDataVal ?? "no-data";

  let errorTaskErrorVal: Error | undefined;
  errorTask.error.subscribe(v => errorTaskErrorVal = v);
  $: errorTaskError = errorTaskErrorVal?.message ?? "no-error";

  let errorTaskDataVal: string | undefined;
  errorTask.data.subscribe(v => errorTaskDataVal = v);
  $: errorTaskData = errorTaskDataVal ?? "no-data";

  let parallelProgressVal = 0;
  parallel.progress.subscribe(v => parallelProgressVal = v);
  $: parallelProgress = String(parallelProgressVal);

  let parallelResultsVal: (string | undefined)[] = [];
  parallel.results.subscribe(v => {
    parallelResultsVal = v;
  });
  $: parallelResults = parallelResultsVal ? parallelResultsVal.filter((r): r is string => r !== undefined) : [];

  let channelLatestVal: string | undefined;
  ch.latest.subscribe(v => channelLatestVal = v);
  $: channelLatest = channelLatestVal ?? "no-msg";

  let channelHistoryVal: string[] = [];
  ch.history.subscribe(v => channelHistoryVal = v);
  $: channelHistory = [...channelHistoryVal];

  let channelClosedVal = false;
  chClose.isClosed.subscribe(v => channelClosedVal = v);
  $: channelClosed = String(channelClosedVal);

  let broadcastLatestVal: string | undefined;
  bus.latest.subscribe(v => broadcastLatestVal = v);
  $: broadcastLatest = broadcastLatestVal ?? "no-msg";

  let pollDataVal: string | undefined;
  poller.data.subscribe(v => pollDataVal = v);
  $: pollData = pollDataVal ?? "no-data";

  let pollCountVal = 0;
  poller.pollCount.subscribe(v => pollCountVal = v);
  $: pollCountStr = String(pollCountVal);

  let isPollingVal = false;
  pollerStop.isPolling.subscribe(v => isPollingVal = v);
  $: isPolling = String(isPollingVal);

  let pollStopDataVal: string | undefined;
  pollerStop.data.subscribe(v => pollStopDataVal = v);
  $: pollStopData = pollStopDataVal ?? "no-data";

  // Action handlers
  async function executeManualTask() {
    await manualTask.execute();
  }

  async function executeErrorTask() {
    await errorTask.execute();
  }

  async function sendMessages() {
    await ch.send("msg-1");
    await ch.send("msg-2");
  }

  function doBroadcast() {
    bus.broadcast("hello");
    bus.broadcast("world");
  }

  function stopPolling() {
    pollerStop.stop();
  }
</script>

{#if testType === "scope"}
  <span data-testid="active">{scopeActive}</span>
{/if}

{#if testType === "task-immediate"}
  <span data-testid="data">{taskData}</span>
  <span data-testid="loading">{taskLoading}</span>
{/if}

{#if testType === "task-manual"}
  <span data-testid="data">{manualTaskData}</span>
  <button data-testid="execute-btn" on:click={executeManualTask}>Execute</button>
{/if}

{#if testType === "task-error"}
  <span data-testid="data">{errorTaskData}</span>
  <span data-testid="error">{errorTaskError}</span>
  <button data-testid="execute-btn" on:click={executeErrorTask}>Execute</button>
{/if}

{#if testType === "parallel"}
  <span data-testid="progress">{parallelProgress}</span>
  <span data-testid="results">{JSON.stringify(parallelResults)}</span>
{/if}

{#if testType === "channel"}
  <span data-testid="latest">{channelLatest}</span>
  <span data-testid="history">{JSON.stringify(channelHistory)}</span>
  <button data-testid="send-btn" on:click={sendMessages}>Send</button>
{/if}

{#if testType === "channel-close"}
  <span data-testid="closed">{channelClosed}</span>
  <button data-testid="close-btn" on:click={() => chClose.close()}>Close</button>
{/if}

{#if testType === "broadcast"}
  <span data-testid="latest">{broadcastLatest}</span>
  <button data-testid="broadcast-btn" on:click={doBroadcast}>Broadcast</button>
{/if}

{#if testType === "polling"}
  <span data-testid="data">{pollData}</span>
  <span data-testid="count">{pollCountStr}</span>
{/if}

{#if testType === "polling-stop"}
  <span data-testid="data">{pollStopData}</span>
  <span data-testid="polling">{isPolling}</span>
  <button data-testid="stop-btn" on:click={stopPolling}>Stop</button>
{/if}
