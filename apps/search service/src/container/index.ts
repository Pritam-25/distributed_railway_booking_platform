import { SearchContainer } from "./search.container.js";

const searchContainer = SearchContainer.getInstance();

export const { searchController } = searchContainer;

export { SearchContainer };
export const stationConsumer = searchContainer.stationConsumer;
