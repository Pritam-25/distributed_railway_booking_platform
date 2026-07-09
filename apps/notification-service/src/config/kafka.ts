import {
  createConsumer,
  createKafkaClient,
  KafkaProducerManager,
  type Consumer,
} from "@irctc/kafka";
import { env } from "@config";

/**
 * Shared Kafka client instance for the notification service.
 * Configured using environment variables for client ID and brokers list.
 */
const kafka = createKafkaClient({
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
export const getProducer = async () => {
  return await KafkaProducerManager.getProducer(kafka);
};

/**
 * Synchronously retrieves the Kafka Producer instance if it has already been initialized.
 * Throws an error if the producer has not been initialized yet.
 *
 * @returns The initialized Kafka Producer instance.
 */
export const getProducerSync = () => {
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

/**
 * Creates and returns a new Kafka consumer instance for the specified group ID.
 *
 * @param groupId - The consumer group ID this consumer will join.
 * @returns An initialized Consumer instance.
 */
export const getConsumer = (groupId: string): Consumer => {
  return createConsumer(kafka, groupId);
};
