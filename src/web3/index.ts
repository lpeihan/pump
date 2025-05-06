import * as anchor from '@coral-xyz/anchor';
import {
  createCreateMetadataAccountV3Instruction,
  Metadata,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import BN from 'bn.js';
import dayjs from 'dayjs';

console.log(dayjs(1746542312 * 1000).format('YYYY-MM-DD HH:mm:ss'));

import { SellToken } from './idl/sell_token';

import numberUtils from '@/utils/numberUtils';

export const config = {
  rpcUrl: 'https://api.devnet.solana.com',

  programId: '8u2V6SHBURgDV23rvWFKBvPvhthYKP3eHfYgGJzQHLps',
  usdtMint: '7p152r89TzRipiz3KZ4BYABDawJrcH5J5uCJs8H9iyn4',
  btcMint: '9H6VhHiCJ4C7aXGASTyd7vjYy9b7eMTjzJH83y2YCodF',
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
  return new BN(String(value));
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

export const sendTransaction = async (transaction, signers = []) => {
  try {
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 500000,
      }),
    );

    transaction.feePayer = authority;
    const { blockhash } = await provider.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    const signature = await provider.sendAndConfirm(transaction, signers);
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

  for (const tokenAccount of result) {
    const metadata = await getTokenMetadata(tokenAccount.account.data.parsed.info.mint);
    tokenAccount.metadata = convertBN(metadata);
  }

  console.log('🚀 ~ getTokenAccounts ~ result:', result);

  return result;
};

export const getTokenMetadata = async (mintAddress) => {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      METADATA_PROGRAM_ID,
    );

    const metadataAccount = await connection.getAccountInfo(metadataAddress);
    if (!metadataAccount) {
      return null;
    }

    const metadata = Metadata.deserialize(metadataAccount.data);

    const cleanMetadata = {
      name: metadata[0].data.name.replace(/\0/g, ''),
      symbol: metadata[0].data.symbol.replace(/\0/g, ''),
      uri: metadata[0].data.uri.replace(/\0/g, ''),
      sellerFeeBasisPoints: metadata[0].data.sellerFeeBasisPoints,
      creators: metadata[0].data.creators,
      description: '',
      image: '',
    };
    if (cleanMetadata.uri.startsWith('data:application/json;base64,')) {
      const jsonData = JSON.parse(
        Buffer.from(
          cleanMetadata.uri.replace('data:application/json;base64,', ''),
          'base64',
        ).toString(),
      );

      cleanMetadata.description = jsonData.description;
      cleanMetadata.image = jsonData.image;
    }

    return cleanMetadata;
  } catch (error) {
    console.error('Failed to fetch token metadata:', error);
    throw error;
  }
};

export const createToken = async (
  tokenName,
  tokenSymbol,
  decimals,
  tokenSupply,
  description,
  imageUrl,
) => {
  const mintKeypair = Keypair.generate();

  const createMintIx = SystemProgram.createAccount({
    fromPubkey: authority,
    newAccountPubkey: mintKeypair.publicKey,
    space: 82,
    lamports: await connection.getMinimumBalanceForRentExemption(82),
    programId: TOKEN_PROGRAM_ID,
  });

  const initMintIx = await createInitializeMintInstruction(
    mintKeypair.publicKey,
    decimals,
    authority,
    authority,
    TOKEN_PROGRAM_ID,
  );

  const associatedTokenAccount = await getAssociatedTokenAddress(mintKeypair.publicKey, authority);

  const createATAInstruction = createAssociatedTokenAccountInstruction(
    authority,
    associatedTokenAccount,
    authority,
    mintKeypair.publicKey,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const mintToIx = createMintToInstruction(
    mintKeypair.publicKey,
    associatedTokenAccount,
    authority,
    Math.pow(10, decimals) * tokenSupply,
  );

  const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

  const [metadataAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
    METADATA_PROGRAM_ID,
  );

  const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataAccount,
      mint: mintKeypair.publicKey,
      mintAuthority: authority,
      payer: authority,
      updateAuthority: authority,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: tokenName,
          symbol: tokenSymbol,
          uri: description
            ? `data:application/json;base64,${Buffer.from(
                JSON.stringify({
                  name: tokenName,
                  symbol: tokenSymbol,
                  description,
                  image: imageUrl,
                }),
              ).toString('base64')}`
            : 'https://5qonlmdunmih2jlu2obartr7cngqdcagfysp7rccfkxxarrt3wda.arweave.net/7BzVsHRrEH0ldNOCCM4_E00BiAYuJP_EQiqvcEYz3YY',
          sellerFeeBasisPoints: 0,
          creators: [
            {
              address: authority,
              share: 100,
              verified: true,
            },
          ],
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    },
  );

  const transaction = new Transaction().add(
    createMintIx,
    initMintIx,
    createATAInstruction,
    mintToIx,
    createMetadataInstruction,
  );

  await sendTransaction(transaction, [mintKeypair]);
  return mintKeypair.publicKey.toString();
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
    [Buffer.from('token_purchase'), authority.toBuffer(), BTC_MINT.toBuffer()],
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
    const amount = numberUtils.movePointRight(2000, 9);
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
    const ownerTokenAccount = getAssociatedTokenAddressSync(BTC_MINT, authority);
    const refundTokenAccount = getAssociatedTokenAddressSync(USDT_MINT, authority);

    const [sale] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_sale'), BTC_MINT.toBuffer()],
      PROGRAM_ID,
    );
    const [saleTokenAccount] = PublicKey.findProgramAddressSync(
      [sale.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), BTC_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const [contractTokenAccount] = PublicKey.findProgramAddressSync(
      [sale.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDT_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const transaction = new Transaction();

    try {
      await getAccount(connection, ownerTokenAccount);
    } catch (error) {
      console.log('🚀 ~ ownerTokenAccount ~ error:', error);
      const instruction = createAssociatedTokenAccountInstruction(
        authority,
        ownerTokenAccount,
        authority,
        BTC_MINT,
        TOKEN_PROGRAM_ID,
      );
      transaction.add(instruction);
    }

    try {
      await getAccount(connection, refundTokenAccount);
    } catch (error) {
      console.log('🚀 ~ refundTokenAccount ~ error:', error);
      const instruction = createAssociatedTokenAccountInstruction(
        authority,
        refundTokenAccount,
        authority,
        USDT_MINT,
        TOKEN_PROGRAM_ID,
      );
      transaction.add(instruction);
    }

    const instruction = await program.methods
      .withdrawTokens()
      .accounts({
        tokenMint: BTC_MINT,
        buyTokenMint: USDT_MINT,
        owner: authority,
        ownerTokenAccount,
        saleTokenAccount,
        refundTokenAccount,
        contractTokenAccount,
      })
      .instruction();

    transaction.add(instruction);

    await sendTransaction(transaction);
  } catch (error) {
    console.log('🚀 ~ withdrawTokens ~ error:', error);
    throw error;
  }
};
