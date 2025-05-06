import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import BN from 'bn.js';

import { SellToken } from './idl/sell_token';

import numberUtils from '@/utils/numberUtils';

export const config = {
  rpcUrl: 'https://api.devnet.solana.com',

  programId: '4PkMVY2Z42R3RTyPmaGUD5FYQx3WJv3acYFLZeUv8iBT',
  usdtMint: 'CXR4u9xWA5U1gu6yHaaX8F8ebonhC7KzScoWkCudPkwk',
  btcMint: 'Erkvc3uZDHk7M7w48aZW7EBcAFj4zZZFCNhdqyonA436',
};

export const PROGRAM_ID = new PublicKey(config.programId);
export const USDT_MINT = new PublicKey(config.usdtMint);
export const BTC_MINT = new PublicKey(config.btcMint);

const connection = new Connection(config.rpcUrl, 'confirmed');
let authority: PublicKey;
let provider: anchor.AnchorProvider;
let program: anchor.Program<SellToken>;

export const convertBN = (obj) => {
  if (obj && obj.toBase58) {
    return obj.toBase58();
  }

  if (BN.isBN(obj)) {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBN);
  }

  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, convertBN(value)]));
  }

  return obj;
};

export const toBuffer = (value) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));

  return buffer;
};

export const toBN = (value) => {
  return new BN(value);
};

export const connectWallet = async () => {
  try {
    const wallet = new PhantomWalletAdapter();
    await wallet.connect();

    authority = wallet.publicKey;
    provider = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: 'confirmed',
    });
    program = new anchor.Program(require('./idl/sell_token.json'), provider);

    return authority.toBase58();
  } catch (error) {
    console.error('connect wallet failed:', error);
    throw error;
  }
};

export const sendTransaction = async (transaction) => {
  try {
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 500000,
      }),
    );

    transaction.feePayer = authority;
    const { blockhash } = await provider.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    const signature = await provider.sendAndConfirm(transaction);
    console.log('🚀 ~ sendTransaction ~ signature:', signature);

    return signature;
  } catch (err) {
    console.log('🚀 ~ sendTransaction ~ err:', err);
    throw err;
  }
};

export const accountFetch = async (method, ...params) => {
  try {
    const bnResponse = await program.account[method].fetch(...params);

    const response = convertBN(bnResponse);
    console.log(`🚀 ~ accountFetch ~ ${method}:`, response);

    return response;
  } catch (err) {
    console.log(`🚀 ~ accountFetch ~ ${method} ~ err:`, err);
    throw err;
  }
};

export const getSolBalance = async () => {
  try {
    const balance = await connection.getBalance(authority);

    const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(4);
    console.log('🚀 ~ getSolBalance ~ solBalance:', solBalance);

    return solBalance;
  } catch (error) {
    console.log('🚀 ~ getSolBalance ~ error:', error);

    throw error;
  }
};

export const fetchSaleAccount = async () => {
  const [saleAccountInstance] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_sale'), BTC_MINT.toBuffer()],
    PROGRAM_ID,
  );

  return accountFetch('saleAccount', saleAccountInstance);
};

export const fetchUserPurchase = async () => {
  const [userPurchaseInstance] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_purchase'), authority.toBuffer()],
    PROGRAM_ID,
  );

  return accountFetch('userPurchase', userPurchaseInstance);
};

export const initSaleAccount = async (tokenSymbol, saleAmount, pricePerToken, endTime) => {
  try {
    const tokenMint = new PublicKey(tokenSymbol);
    const ownerTokenAccount = getAssociatedTokenAddressSync(tokenMint, authority);

    const transaction = new Transaction();

    const instruction = await program.methods
      .initSaleAccount(toBN(saleAmount), toBN(pricePerToken), toBN(endTime))
      .accounts({
        tokenMint,
        owner: authority,
        ownerTokenAccount,
        buyTokenMint: USDT_MINT,
      })
      .instruction();

    transaction.add(instruction);

    await sendTransaction(transaction);
  } catch (error) {
    console.log('🚀 ~ initSaleAccount ~ error:', error);
    throw error;
  }
};

export const buyTokens = async () => {
  try {
    const transaction = new Transaction();
    const [sale] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_sale'), BTC_MINT.toBuffer()],
      PROGRAM_ID,
    );
    const amount = numberUtils.movePointRight(200, 9);
    const [saleTokenAccount] = PublicKey.findProgramAddressSync(
      [sale.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDT_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    try {
      await getAccount(connection, saleTokenAccount);
    } catch (error) {
      console.log('🚀 ~ buyTokens ~ error:', error);
      const instruction = createAssociatedTokenAccountInstruction(
        authority,
        saleTokenAccount,
        sale,
        USDT_MINT,
        TOKEN_PROGRAM_ID,
      );
      transaction.add(instruction);
    }
    const instruction = await program.methods
      .buyToken(toBN(amount))
      .accounts({
        sale,
        saleTokenAccount,
        tokenMint: BTC_MINT,
        buyer: authority,
        buyerTokenAccount: getAssociatedTokenAddressSync(USDT_MINT, authority),
        buyTokenMint: USDT_MINT,
      })
      .instruction();

    transaction.add(instruction);

    await sendTransaction(transaction);
  } catch (error) {
    console.log('🚀 ~ buyTokens ~ error:', error);
    throw error;
  }
};

export const withdrawTokens = async () => {
  try {
    const [sale] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_sale'), BTC_MINT.toBuffer()],
      PROGRAM_ID,
    );

    const transaction = new Transaction();

    const instruction = await program.methods
      .withdrawTokens()
      .accounts({
        sale,
        tokenMint: BTC_MINT,
        owner: authority,
        ownerTokenAccount: '',
        saleTokenAccount: '',
      })
      .instruction();

    transaction.add(instruction);

    await sendTransaction(transaction);
  } catch (error) {
    console.log('🚀 ~ withdrawTokens ~ error:', error);
    throw error;
  }
};

export const getTokenAccounts = async () => {
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(authority, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(authority, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  ]);

  const result = convertBN([...tokenAccounts.value, ...token2022Accounts.value]);

  console.log('🚀 ~ getTokenAccounts ~ result:', result);

  return result;
};
