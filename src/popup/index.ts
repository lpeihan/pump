import { showPopup } from './core';

export const showSimplePopup = () => {
  showPopup(require('./SimplePopup.vue').default);
};
