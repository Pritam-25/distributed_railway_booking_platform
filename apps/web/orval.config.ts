import { defineConfig } from "orval"

export default defineConfig({
  apiGateway: {
    input: {
      target: "../api-gateway/openapi.json",
      override: {
        transformer: "./scripts/orval-transformer.ts",
      },
    },
    output: {
      mode: "tags-split",
      target: "./generated/endpoints",
      schemas: "./generated/model",
      client: "react-query",
      httpClient: "axios",
      clean: true,
      indexFiles: true,
      override: {
        mutator: {
          path: "./lib/api-client.ts",
          name: "customInstance",
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
  },
})
