import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api/v1')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  const swagger = new DocumentBuilder()
    .setTitle('OpenAgents API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger))

  const port = process.env.PORT ?? 3001
  await app.listen(port)
  console.log(`API running on http://localhost:${port}`)
  console.log(`Swagger docs: http://localhost:${port}/docs`)
}

bootstrap()
