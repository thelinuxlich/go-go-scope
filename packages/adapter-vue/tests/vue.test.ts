/**
 * Integration tests for @go-go-scope/adapter-vue
 */
import { describe, test, expect, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import {
	useScope,
	useTask,
	useParallel,
	useChannel,
	useBroadcast,
} from "../src/index.js";

describe("Vue adapter integration", () => {
	describe("useScope", () => {
		test("creates scope that disposes on unmount", async () => {
			const onDispose = vi.fn();

			const Component = defineComponent({
				setup() {
					const s = useScope({ name: "test-scope" });
					s.onDispose(onDispose);
					return { isActive: s.isActive };
				},
				render() {
					return h("div", this.isActive ? "active" : "inactive");
				},
			});

			const wrapper = mount(Component);
			expect(wrapper.text()).toBe("active");

			await wrapper.unmount();

			// Give time for async disposal
			await new Promise((r) => setTimeout(r, 50));
			expect(onDispose).toHaveBeenCalled();
		});

		test("scope executes tasks", async () => {
			const Component = defineComponent({
				setup() {
					const s = useScope();
					const result = ref("");

					const runTask = async () => {
						const [, data] = await s.task(() =>
							Promise.resolve("hello"),
						);
						result.value = data ?? "";
					};

					return { result, runTask };
				},
				render() {
					return h("div", this.result);
				},
			});

			const wrapper = mount(Component);
			await wrapper.vm.runTask();
			await nextTick();

			expect(wrapper.text()).toBe("hello");
		});
	});

	describe("useTask", () => {
		test("executes task immediately when immediate is true", async () => {
			const Component = defineComponent({
				setup() {
					const task = useTask(
						async () => "fetched-data",
						{ immediate: true },
					);
					return { task };
				},
				render() {
					return h("div", [
						h("span", { class: "loading" }, this.task.isLoading ? "loading" : "done"),
						h("span", { class: "data" }, this.task.data ?? "no-data"),
					]);
				},
			});

			const wrapper = mount(Component);

			// Should start loading
			expect(wrapper.find(".loading").text()).toBe("loading");

			// Wait for completion
			await new Promise((r) => setTimeout(r, 50));
			await nextTick();

			expect(wrapper.find(".loading").text()).toBe("done");
			expect(wrapper.find(".data").text()).toBe("fetched-data");
		});

		test("manual execution with execute()", async () => {
			let callCount = 0;

			const Component = defineComponent({
				setup() {
					const task = useTask(async () => {
						callCount++;
						return `result-${callCount}`;
					}, { immediate: false });

					return { task };
				},
				render() {
					return h("div", [
						h("span", { class: "data" }, this.task.data ?? "no-data"),
						h("button", { onClick: this.task.execute }, "Run"),
					]);
				},
			});

			const wrapper = mount(Component);
			expect(wrapper.find(".data").text()).toBe("no-data");

			// Execute manually
			await wrapper.find("button").trigger("click");
			await new Promise((r) => setTimeout(r, 50));
			await nextTick();

			expect(wrapper.find(".data").text()).toBe("result-1");
			expect(callCount).toBe(1);
		});

		test("handles task errors", async () => {
			const Component = defineComponent({
				setup() {
					const task = useTask(
						async () => {
							throw new Error("Task failed");
						},
						{ immediate: false },
					);

					return { task };
				},
				render() {
					return h("div", [
						h("span", { class: "error" }, this.task.error?.message ?? "no-error"),
						h("span", { class: "data" }, this.task.data ?? "no-data"),
						h("button", { onClick: this.task.execute }, "Run"),
					]);
				},
			});

			const wrapper = mount(Component);
			await wrapper.find("button").trigger("click");
			await new Promise((r) => setTimeout(r, 50));
			await nextTick();

			expect(wrapper.find(".error").text()).toBe("Task failed");
			expect(wrapper.find(".data").text()).toBe("no-data");
		});

		test.skip("cancels task on unmount", async () => {
			let wasCancelled = false;

			const Component = defineComponent({
				setup() {
					const task = useTask(
						async ({ signal }: { signal: AbortSignal }) => {
							return new Promise((resolve, reject) => {
								signal.addEventListener("abort", () => {
									wasCancelled = true;
									reject(new Error("Cancelled"));
								});
								// Long running task
								setTimeout(() => resolve("done"), 10000);
							});
						},
						{ immediate: true },
					);

					return { task };
				},
				render() {
					return h("div", this.task.isLoading ? "loading" : "done");
				},
			});

			const wrapper = mount(Component);
			await new Promise((r) => setTimeout(r, 50));

			await wrapper.unmount();
			// Wait for scope disposal to propagate
			await new Promise((r) => setTimeout(r, 100));

			expect(wasCancelled).toBe(true);
		});
	});

	describe("useParallel", () => {
		test("executes tasks in parallel with progress", async () => {
			const delays = [50, 30, 70];
			const factories = delays.map((delay, i) => async () => {
				await new Promise((r) => setTimeout(r, delay));
				return `task-${i}`;
			});

			const Component = defineComponent({
				setup() {
					const parallel = useParallel(factories, { immediate: true });
					return { parallel };
				},
				render() {
					return h("div", [
						h("span", { class: "progress" }, `${this.parallel.progress}%`),
						h("span", { class: "results" }, JSON.stringify(this.parallel.results)),
					]);
				},
			});

			const wrapper = mount(Component);

			// Wait for all tasks
			await new Promise((r) => setTimeout(r, 200));
			await nextTick();

			expect(wrapper.find(".progress").text()).toBe("100%");
			const results = JSON.parse(wrapper.find(".results").text());
			expect(results).toContain("task-0");
			expect(results).toContain("task-1");
			expect(results).toContain("task-2");
		});

		test.skip("respects concurrency limit", async () => {
			let running = 0;
			let maxRunning = 0;
			const startTimes: number[] = [];

			const factories = Array.from({ length: 5 }, (_, i) => async () => {
				running++;
				maxRunning = Math.max(maxRunning, running);
				startTimes.push(Date.now());
				await new Promise((r) => setTimeout(r, 80));
				running--;
				return `done-${i}`;
			});

			const Component = defineComponent({
				setup() {
					const parallel = useParallel(factories, {
						concurrency: 2,
						immediate: false,
					});
					return { parallel };
				},
				render() {
					return h("button", { onClick: this.parallel.execute }, "Run");
				},
			});

			const wrapper = mount(Component);
			await wrapper.find("button").trigger("click");
			
			// Wait for all tasks to complete
			await new Promise((r) => setTimeout(r, 500));

			// With concurrency of 2, at most 2 tasks should run simultaneously
			expect(maxRunning).toBeLessThanOrEqual(2);
		});
	});

	describe("useChannel", () => {
		test.skip("sends and receives messages", async () => {
			const Component = defineComponent({
				setup() {
					const ch = useChannel<string>();

					const sendMessages = async () => {
						await ch.send("msg-1");
						await ch.send("msg-2");
					};

					return { ch, sendMessages };
				},
				render() {
					return h("div", [
						h("span", { class: "latest" }, this.ch.latest ?? "no-msg"),
						h("span", { class: "history" }, JSON.stringify(this.ch.history)),
						h("button", { onClick: this.sendMessages }, "Send"),
					]);
				},
			});

			const wrapper = mount(Component);

			await wrapper.find("button").trigger("click");
			
			// Wait for messages to be processed (channel is async)
			await new Promise((r) => setTimeout(r, 300));

			// Check that both messages were received
			const history = JSON.parse(wrapper.find(".history").text());
			expect(history).toEqual(["msg-1", "msg-2"]);
			expect(wrapper.find(".latest").text()).toBe("msg-2");
		});

		test("closes channel properly", async () => {
			const Component = defineComponent({
				setup() {
					const ch = useChannel<string>();
					return { ch };
				},
				render() {
					return h("div", [
						h("span", { class: "closed" }, this.ch.isClosed ? "yes" : "no"),
						h("button", { onClick: this.ch.close }, "Close"),
					]);
				},
			});

			const wrapper = mount(Component);
			expect(wrapper.find(".closed").text()).toBe("no");

			// Close channel
			await wrapper.find("button").trigger("click");
			await new Promise((r) => setTimeout(r, 50));
			await nextTick();

			expect(wrapper.find(".closed").text()).toBe("yes");
		});
	});

	describe("useBroadcast", () => {
		test("sends and receives broadcasts", async () => {
			const Component = defineComponent({
				setup() {
					const bus = useBroadcast<string>();

					const doSend = async () => {
						await bus.send("hello");
						await bus.send("world");
					};

					return { bus, doSend };
				},
				render() {
					return h("div", [
						h("span", { class: "latest" }, this.bus.latest ?? "no-msg"),
						h("button", { onClick: this.doSend }, "Send"),
					]);
				},
			});

			const wrapper = mount(Component);
			
			await wrapper.find("button").trigger("click");
			await new Promise((r) => setTimeout(r, 50));
			await nextTick();

			expect(wrapper.find(".latest").text()).toBe("world");
		});
	});
});
