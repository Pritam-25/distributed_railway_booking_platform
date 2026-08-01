import {
  createConsumer,
  createKafkaClient,
  KafkaProducerManager,
  type Consumer,
  type Kafka,
  type Producer,
} from "@irctc/kafka";
import { env } from "@config";
import { logger } from "@irctc/logger";

/**
 * Shared `KafkaJS` client instance scoped to search-service.
 *
 * @remarks
 * Encapsulates broker list and client ID configuration without opening network connections.
 */
const kafka: Kafka = createKafkaClient({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.KAFKA_BROKERS,
  logger: logger,
});

export { kafka };

/**
 * Returns the connected process-wide Kafka producer singleton.
 *
 * @remarks
 * ### Responsibilities
 * - Delegates to {@link KafkaProducerManager.getProducer} for singleton management.
 *
 * ### Side Effects
 * - **Kafka**: Connects producer socket on first invocation.
 * @returns Connected Kafka producer instance.
 */
export const getProducer = async (): Promise<Producer> => {
  // 1. Retrieve or connect process-wide Kafka producer singleton
  return await KafkaProducerManager.getProducer(kafka);
};

/**
 * Returns the producer synchronously if already connected.
 *
 * @returns Connected Kafka producer instance.
 * @throws {Error} If producer has not been initialized.
 */
export const getProducerSync = (): Producer => {
  return KafkaProducerManager.getProducerSync();
};

/**
 * Reports whether the Kafka producer is currently connected to brokers.
 *
 * @returns Boolean flag indicating connection readiness.
 */
export const isKafkaProducerReady = (): boolean => {
  return KafkaProducerManager.isConnected();
};

/**
 * Disconnects the Kafka producer and releases broker network connections.
 *
 * @remarks
 * ### Side Effects
 * - **Kafka**: Closes producer TCP connections.
 */
export const disconnectKafka = async (): Promise<void> => {
  // 1. Disconnect Kafka producer manager
  await KafkaProducerManager.disconnect();
};

/**
 * Bootstraps Kafka producer connection during service startup.
 *
 * @remarks
 * ### Responsibilities
 * - Connects producer before consumer loops start.
 *
 * ### Side Effects
 * - **Kafka**: Connects producer to broker network.
 */
export const initKafka = async (): Promise<void> => {
  // 1. Initialize and connect process-wide Kafka producer
  await getProducer();
};

/**
 * Creates a new Kafka consumer instance for a specific consumer group.
 *
 * @remarks
 * ### Responsibilities
 * - Constructs topic-specific consumer for independent partition offset processing.
 * @param groupId - Kafka consumer group identifier.
 * @returns Created Kafka consumer instance.
 */
export const getConsumer = (groupId: string): Consumer => {
  return createConsumer(kafka, groupId);
};
