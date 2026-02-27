# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.4.0] - 2026-02-27

### Added

#### Worker Thread Support (Multithreading)

- **WorkerPool class** - Manage a pool of worker threads for CPU-intensive operations
  - Configurable pool size (defaults to CPU count)
  - Idle timeout with automatic cleanup
  - `execute()` for single task execution
  - `executeBatch()` for batch processing with ordered/unordered results
  - Full `AsyncDisposable` support for automatic cleanup

- **parallel() worker option** - Execute tasks in worker threads
  - `workers?: number` - Number of worker threads to use
  - `workerIdleTimeout?: number` - Idle timeout for worker pool
  - Functions are serialized and executed in isolation

- **scope.task() worker option** - Run individual tasks in worker threads
  - `worker?: boolean` - Execute task in a worker thread
  - Lazy worker pool creation and automatic cleanup

- **scheduler.onSchedule() worker option** - Run scheduled jobs in worker threads
  - Third parameter `options?: { worker?: boolean }`
  - Allows different handlers for the same schedule to use workers differently

#### Important Notes

- Worker threads use `eval()` for function serialization (required for transferring functions)
- Functions executed in workers must be **self-contained** (no external closures)
- Build warnings about `eval()` usage are expected and can be ignored

## [2.3.1] - Previous Release

- Previous stable release with structured concurrency primitives
