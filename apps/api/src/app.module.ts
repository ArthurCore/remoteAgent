import { type DynamicModule, Module } from "@nestjs/common";

import { HealthController } from "./platform/health.controller.js";
import { HealthService, type ReadinessProbe } from "./platform/health.service.js";

@Module({})
export class AppModule {
  static register(readinessProbes: readonly ReadinessProbe[]): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useFactory: () => new HealthService(readinessProbes),
        },
      ],
    };
  }
}
