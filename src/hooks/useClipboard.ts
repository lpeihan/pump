import { useClipboard as useOriginalClipboard } from '@vueuse/core';
import { showToast } from 'vant';
import { ref } from 'vue';

import { i18n } from '@/locales';

export const useClipboard = (value = '', successText = i18n.global.t('copied')) => {
  const source = ref(value);
  const { text, copied, copy } = useOriginalClipboard({ source });

  const copyToClipboard = async () => {
    await copy(source.value);
    showToast(successText);
  };

  return {
    text,
    copied,
    copy: copyToClipboard,
  };
};
