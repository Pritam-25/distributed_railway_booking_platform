import { createKafkaClient } from "@irctc/kafka";
import { TOPIC_DEFINITIONS } from "@irctc/contracts";
import { logger } from "@irctc/logger";

const brokersEnv = process.env.KAFKA_BROKERS || "localhost:9092";
const brokers = brokersEnv.split(",").map((b) => b.trim());

logger.info({ brokers }, "Initializing Kafka admin client...");

const kafka = createKafkaClient({
  clientId: "kafka-init-script",
  brokers,
});

const admin = kafka.admin();

async function run() {
  let connected = false;
  const maxAttempts = 30;
  const attemptDelayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`Connecting to Kafka broker (attempt ${attempt}/${maxAttempts})...`);
      await admin.connect();
      connected = true;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: message },
        `Kafka not ready yet, retrying in ${attemptDelayMs / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, attemptDelayMs));
    }
  }

  if (!connected) {
    logger.error("Could not connect to Kafka broker. Exiting.");
    process.exit(1);
  }

  try {
    // List existing topics
    const existingTopics = await admin.listTopics();
    logger.info({ count: existingTopics.length }, "Discovered existing Kafka topics");

    const topicsToCreate = TOPIC_DEFINITIONS.filter(
      (def) => !existingTopics.includes(def.name)
    );

    if (topicsToCreate.length === 0) {
      logger.info("All topics already exist. No new topics to create.");
      return;
    }

    logger.info(
      { topics: topicsToCreate.map((t) => t.name) },
      `Creating ${topicsToCreate.length} missing topics...`
    );

    await admin.createTopics({
      topics: topicsToCreate.map((def) => ({
        topic: def.name,
        numPartitions: def.partitions,
        replicationFactor: def.replicationFactor,
        configEntries: [
          { name: "retention.ms", value: String(def.retentionMs) },
        ],
      })),
    });

    logger.info("Kafka topics created successfully.");
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, "Error creating Kafka topics");
    process.exit(1);
  } finally {
    await admin.disconnect();
  }
}

await run();
