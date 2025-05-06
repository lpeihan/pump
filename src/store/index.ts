import { defineStore } from 'pinia';

import { formatWallet } from '@/utils';
import storage from '@/utils/storage';
import { connectWallet, getSolBalance } from '@/web3';

export const useStore = defineStore('store', {
  state: () => {
    return {
      walletAddress: '',
      solBalance: '0.00',
    };
  },
  actions: {
    setWalletAddress(walletAddress) {
      this.walletAddress = walletAddress;

      storage.session.setItem('walletAddress', walletAddress);
    },
    async connectWallet() {
      const walletAddress = await connectWallet();

      this.setWalletAddress(walletAddress);
      this.onWalletConnected();
    },
    async autoConnectWallet() {
      if (!storage.session.getItem('walletAddress')) {
        return;
      }

      return await this.connectWallet();
    },
    async getSolBalance() {
      const balance = await getSolBalance();

      this.solBalance = balance;
    },
    async onWalletConnected() {
      this.getSolBalance();
    },
  },
  getters: {
    formattedWalletAddress: (state) => formatWallet(state.walletAddress),
  },
});
