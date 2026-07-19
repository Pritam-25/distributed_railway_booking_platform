import {
  createKafkaClient,
  KafkaProducerManager,
  type Kafka,
  type Producer,
} from "@irctc/kafka";
import { env } from "@config";

/**
 * Shared Kafka client instance for the user service.
 * Configured using environment variables for client ID and brokers list.
 */
const kafka: Kafka = createKafkaClient({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.KAFKA_BROKERS,
});

export { kafka };

/**
 * Asynchronously retrieves or initializes the Kafka Producer instance.
 * Ensures the producer is connected before returning.
 *
 * @returns A promise that resolves to the connected Kafka Producer.
 */
export const getProducer = async (): Promise<Producer> => {
  return await KafkaProducerManager.getProducer(kafka);
};

/**
 * Synchronously retrieves the Kafka Producer instance if it has already been initialized.
 * Throws an error if the producer has not been initialized yet.
 *
 * @returns The initialized Kafka Producer instance.
 */
export const getProducerSync = (): Producer => {
  return KafkaProducerManager.getProducerSync();
};

/**
 * Checks whether the Kafka Producer is currently connected and ready.
 *
 * @returns True if the producer is connected, false otherwise.
 */
export const isKafkaProducerReady = () => {
  return KafkaProducerManager.isConnected();
};

/**
 * Gracefully disconnects the Kafka Producer client.
 *
 * @returns A promise that resolves when the producer is disconnected.
 */
export const disconnectKafka = async () => {
  await KafkaProducerManager.disconnect();
};

/**
 * Bootstraps the Kafka connections during service startup.
 * Ensures that the producer is connected and ready to process messages.
 *
 * @returns A promise that resolves when bootstrapping completes.
 */
export const initKafka = async (): Promise<void> => {
  await getProducer();
};
