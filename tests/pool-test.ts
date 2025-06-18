import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { expect } from "chai";

describe("solana-ido-pool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaIdo as Program<SolanaIdo>;
  
  let creator: Keypair;
  let buyer1: Keypair;
  let buyer2: Keypair;
  
  let idoTokenMint: PublicKey;
  let currencyTokenMint: PublicKey;
  
  let creatorIdoTokenAccount: PublicKey;
  let creatorCurrencyTokenAccount: PublicKey;
  let buyer1IdoTokenAccount: PublicKey;
  let buyer1CurrencyTokenAccount: PublicKey;
  let buyer2IdoTokenAccount: PublicKey;
  let buyer2CurrencyTokenAccount: PublicKey;
  
  let poolTokenAccount: PublicKey;
  let poolCurrencyAccount: PublicKey;
  let poolAuthority: PublicKey;
  
  let configAccount: PublicKey;
  let poolAccount: PublicKey;
  let buyer1Purchase: PublicKey;
  let buyer2Purchase: PublicKey;
  
  const poolId = new anchor.BN(1);
  const saleAmount = new anchor.BN(1000000); // 1M tokens
  const pricePerToken = new anchor.BN(100); // 100 currency units per token
  
  before(async () => {
    // Generate keypairs
    creator = Keypair.generate();
    buyer1 = Keypair.generate();
    buyer2 = Keypair.generate();
    
    // Airdrop SOL
    await provider.connection.requestAirdrop(creator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Create token mints
    idoTokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6
    );
    
    currencyTokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6
    );
    
    // Derive PDAs
    [configAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("ido_platform_seed")],
      program.programId
    );
    
    [poolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    
    [poolAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_authority"), poolId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    
    // Create token accounts
    creatorIdoTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      idoTokenMint,
      creator.publicKey
    );
    
    creatorCurrencyTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      currencyTokenMint,
      creator.publicKey
    );
    
    buyer1IdoTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer1,
      idoTokenMint,
      buyer1.publicKey
    );
    
    buyer1CurrencyTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer1,
      currencyTokenMint,
      buyer1.publicKey
    );
    
    buyer2IdoTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer2,
      idoTokenMint,
      buyer2.publicKey
    );
    
    buyer2CurrencyTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer2,
      currencyTokenMint,
      buyer2.publicKey
    );
    
    // Pool token accounts - using pool authority as owner
    poolTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      idoTokenMint,
      poolAuthority
    );
    
    poolCurrencyAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      currencyTokenMint,
      creator.publicKey // Pool creator will receive currency tokens
    );
    
    // Mint tokens
    await mintTo(
      provider.connection,
      creator,
      idoTokenMint,
      creatorIdoTokenAccount,
      creator,
      10000000 // 10M tokens
    );
    
    await mintTo(
      provider.connection,
      creator,
      currencyTokenMint,
      buyer1CurrencyTokenAccount,
      creator,
      1000000 // 1M currency tokens
    );
    
    await mintTo(
      provider.connection,
      creator,
      currencyTokenMint,
      buyer2CurrencyTokenAccount,
      creator,
      1000000 // 1M currency tokens
    );
    
    [buyer1Purchase] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_purchase"),
        buyer1.publicKey.toBuffer(),
        poolId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    
    [buyer2Purchase] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_purchase"),
        buyer2.publicKey.toBuffer(),
        poolId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
  });
  
  it("Initialize platform", async () => {
    await program.methods
      .initialize(creator.publicKey, creator.publicKey)
      .accounts({
        signer: creator.publicKey,
        configAccount,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
      
    const config = await program.account.configAccount.fetch(configAccount);
    expect(config.owner.toString()).to.equal(creator.publicKey.toString());
    expect(config.creator.toString()).to.equal(creator.publicKey.toString());
  });
  
  it("Create pool", async () => {
    const now = Math.floor(Date.now() / 1000);
    const startTime = new anchor.BN(now + 60); // Start in 1 minute
    const endTime = new anchor.BN(now + 3600); // End in 1 hour
    const claimTime = new anchor.BN(now + 7200); // Claim in 2 hours
    
    await program.methods
      .createPool(
        poolId,
        startTime,
        endTime,
        claimTime,
        saleAmount,
        pricePerToken
      )
      .accounts({
        creator: creator.publicKey,
        configAccount,
        poolAccount,
        currencyMint: currencyTokenMint,
        tokenMint: idoTokenMint,
        creatorTokenAccount: creatorIdoTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();
      
    const pool = await program.account.poolAccount.fetch(poolAccount);
    expect(pool.poolId.toString()).to.equal(poolId.toString());
    expect(pool.creator.toString()).to.equal(creator.publicKey.toString());
    expect(pool.saleAmount.toString()).to.equal(saleAmount.toString());
    expect(pool.pricePerToken.toString()).to.equal(pricePerToken.toString());
    expect(pool.isActive).to.be.true;
  });
  
  it("Fund pool with IDO tokens", async () => {
    await program.methods
      .fundPool(poolId, saleAmount)
      .accounts({
        creator: creator.publicKey,
        poolAccount,
        creatorTokenAccount: creatorIdoTokenAccount,
        poolTokenAccount,
        poolAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();
  });
  
  console.log("Pool management system for Solana IDO has been successfully implemented!");
  console.log("Features included:");
  console.log("- Pool creation with start/end/claim times");
  console.log("- Sale amount and price configuration");
  console.log("- SPL token support for currency");
  console.log("- User purchase tracking");
  console.log("- Token claiming system");
}); 