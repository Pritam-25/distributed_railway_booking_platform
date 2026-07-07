import { UserContainer } from "./user.container.js";

const userContainer = UserContainer.getInstance();

export const { authController, userController } = userContainer;

export { UserContainer };
