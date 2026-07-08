import { createKafkaClient, KafkaProducerManager } from "@irctc/kafka";
import { env } from "@config";

const kafka = createKafkaClient({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.KAFKA_BROKERS,
});

export { kafka };

export const getProducer = async () => {
  return await KafkaProducerManager.getProducer(kafka);
};

export const getProducerSync = () => {
  return KafkaProducerManager.getProducerSync();
};

export const isKafkaProducerReady = () => {
  return KafkaProducerManager.isConnected();
};

export const disconnectKafka = async () => {
  await KafkaProducerManager.disconnect();
};

export const initKafka = async (): Promise<void> => {
  await getProducer();
};
