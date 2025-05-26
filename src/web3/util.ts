import * as anchor from '@coral-xyz/anchor';
import {
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  ExtensionType,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Signer,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

// create a token mint and a token2022 mint with transferFeeConfig
export async function createTokenMintAndAssociatedTokenAccount(
  connection: Connection,
  payer: Signer,
  mintAuthority: Signer,
  token0,
  token1,
) {
  interface Token {
    address: PublicKey;
    program: PublicKey;
  }

  let tokenArray: Token[] = [];

  tokenArray.push({ address: token1, program: TOKEN_2022_PROGRAM_ID });
  tokenArray.push({ address: token0, program: TOKEN_PROGRAM_ID });

  tokenArray.sort(function (x, y) {
    const buffer1 = x.address.toBuffer();
    const buffer2 = y.address.toBuffer();

    for (let i = 0; i < buffer1.length && i < buffer2.length; i++) {
      if (buffer1[i] < buffer2[i]) {
        return -1;
      }
      if (buffer1[i] > buffer2[i]) {
        return 1;
      }
    }

    if (buffer1.length < buffer2.length) {
      return -1;
    }
    if (buffer1.length > buffer2.length) {
      return 1;
    }

    return 0;
  });

  token0 = tokenArray[0].address;
  token1 = tokenArray[1].address;
  //   console.log("Token 0", token0.toString());
  //   console.log("Token 1", token1.toString());
  const token0Program = tokenArray[0].program;
  const token1Program = tokenArray[1].program;

  const ownerToken0Account = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    token0,
    payer.publicKey,
    false,
    'processed',
    { skipPreflight: true },
    token0Program,
  );

  await mintTo(
    connection,
    payer,
    token0,
    ownerToken0Account.address,
    mintAuthority,
    100_000_000_000_000,
    [],
    { skipPreflight: true },
    token0Program,
  );

  // console.log(
  //   "ownerToken0Account key: ",
  //   ownerToken0Account.address.toString()
  // );

  const ownerToken1Account = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    token1,
    payer.publicKey,
    false,
    'processed',
    { skipPreflight: true },
    token1Program,
  );
  // console.log(
  //   "ownerToken1Account key: ",
  //   ownerToken1Account.address.toString()
  // );
  await mintTo(
    connection,
    payer,
    token1,
    ownerToken1Account.address,
    mintAuthority,
    100_000_000_000_000,
    [],
    { skipPreflight: true },
    token1Program,
  );

  return [
    { token0, token0Program },
    { token1, token1Program },
  ];
}

export async function createMintWithTransferFee(
  connection: Connection,
  payer: Signer,
  mintAuthority: Signer,
  mintKeypair = Keypair.generate(),
  transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number },
) {
  const transferFeeConfigAuthority = Keypair.generate();
  const withdrawWithheldAuthority = Keypair.generate();

  const extensions = [ExtensionType.TransferFeeConfig];

  const mintLen = getMintLen(extensions);
  const decimals = 9;

  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  const mintTransaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      transferFeeConfigAuthority.publicKey,
      withdrawWithheldAuthority.publicKey,
      transferFeeConfig.transferFeeBasisPoints,
      BigInt(transferFeeConfig.MaxFee),
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined);

  return mintKeypair.publicKey;
}

export async function getUserAndPoolVaultAmount(
  owner: PublicKey,
  token0Mint: PublicKey,
  token0Program: PublicKey,
  token1Mint: PublicKey,
  token1Program: PublicKey,
  poolToken0Vault: PublicKey,
  poolToken1Vault: PublicKey,
) {
  const onwerToken0AccountAddr = getAssociatedTokenAddressSync(
    token0Mint,
    owner,
    false,
    token0Program,
  );

  const onwerToken1AccountAddr = getAssociatedTokenAddressSync(
    token1Mint,
    owner,
    false,
    token1Program,
  );

  const onwerToken0Account = await getAccount(
    anchor.getProvider().connection,
    onwerToken0AccountAddr,
    'processed',
    token0Program,
  );

  const onwerToken1Account = await getAccount(
    anchor.getProvider().connection,
    onwerToken1AccountAddr,
    'processed',
    token1Program,
  );

  const poolVault0TokenAccount = await getAccount(
    anchor.getProvider().connection,
    poolToken0Vault,
    'processed',
    token0Program,
  );

  const poolVault1TokenAccount = await getAccount(
    anchor.getProvider().connection,
    poolToken1Vault,
    'processed',
    token1Program,
  );
  return {
    onwerToken0Account,
    onwerToken1Account,
    poolVault0TokenAccount,
    poolVault1TokenAccount,
  };
}

export function isEqual(amount1: bigint, amount2: bigint) {
  if (
    BigInt(amount1) === BigInt(amount2) ||
    BigInt(amount1) - BigInt(amount2) === BigInt(1) ||
    BigInt(amount1) - BigInt(amount2) === BigInt(-1)
  ) {
    return true;
  }
  return false;
}
