import Joi from 'joi';

export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  DB_HOST?: string;
  DB_PORT?: number;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  LOG_LEVEL: string;
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const schema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
    PORT: Joi.number().port().default(3000),
    DATABASE_URL: Joi.string()
      .uri({ scheme: ['postgres', 'postgresql'] })
      .required(),
    DB_HOST: Joi.string().optional(),
    DB_PORT: Joi.number().port().optional(),
    DB_NAME: Joi.string().optional(),
    DB_USER: Joi.string().optional(),
    DB_PASSWORD: Joi.string().optional(),
    LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
    // ConfigModule validates process.env, which also contains runtime variables
    // supplied by Docker, npm, and the operating system. Validate our contract
    // while ignoring unrelated runtime keys.
  }).unknown(true);

  const validation = schema.validate(config, { abortEarly: false, convert: true }) as {
    error?: Joi.ValidationError;
    value: unknown;
  };
  if (validation.error) {
    throw new Error(`Invalid environment configuration: ${validation.error.message}`);
  }

  return validation.value as Environment;
}
