# @go-go-scope/adapter-nestjs

NestJS adapter for go-go-scope - provides dependency injection integration with `@Task` decorator.

## Installation

```bash
npm install @go-go-scope/adapter-nestjs @nestjs/common
```

## Usage

```typescript
import { Module } from '@nestjs/common'
import { GoGoScopeModule, Task } from '@go-go-scope/adapter-nestjs'

@Module({
  imports: [GoGoScopeModule.forRoot({ metrics: true })],
  providers: [UserService],
})
class AppModule {}

@Injectable()
class UserService {
  @Task({ retry: 'exponential', timeout: 5000 })
  async getUser(id: string) {
    return fetchUser(id)
  }
}
```

## License

MIT
