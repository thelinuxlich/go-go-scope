# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2025-02-23

### Changed

- **BREAKING**: Removed `SchedulerRole` enum and role-based architecture (ADMIN, WORKER, HYBRID)
- **BREAKING**: Removed `loadSchedules` pattern - workers now use `onSchedule(name, handler)`
- **BREAKING**: Removed leader election (no longer needed with atomic database operations)
- **BREAKING**: All scheduler instances can now create/manage schedules AND execute jobs
- Simplified API: no more role configuration needed
- Better worker scaling: just add more instances, no configuration changes needed
- Database atomic operations handle job distribution automatically

### Added

- New `onSchedule(name, handler)` method to register job handlers per schedule name
- New `offSchedule(name)` method to unregister job handlers
- Support for registering handlers before schedules exist (handles automatically when schedule created)

### Removed

- `SchedulerRole` enum
- `AdminState` enum
- `loadSchedules` option from SchedulerOptions
- `role` option from SchedulerOptions
- Leader election methods from JobStorage interface

## [2.0.0] - 2025-02-22

### Added

- Production-ready distributed job scheduler
- Cron expression support with presets (@minutely, @hourly, @daily, @weekly, @monthly)
- Distributed locking via persistence adapters (Redis, PostgreSQL, MySQL, SQLite)
- Job retry with exponential backoff and jitter
- Event hooks for monitoring (jobStarted, jobCompleted, jobFailed, etc.)
- Multiple storage backends: InMemoryJobStorage, RedisJobStorage, SQLJobStorage
- Concurrent execution control per schedule
- One-time and recurring job scheduling
- Leader election for admin role
- Role-based architecture (ADMIN, WORKER, HYBRID)
