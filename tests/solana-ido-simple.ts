import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { expect } from "chai";

describe("Solana IDO - Happy Cases", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaIdo as Program<SolanaIdo>;
  
  // Test accounts
  let creator: Keypair;
  let buyer1: Keypair;
  let buyer2: Keypair;
  
  // Token mints
  let idoTokenMint: PublicKey;
  let currencyTokenMint: PublicKey;
  
  // Token accounts
  let creatorIdoTokenAccount: PublicKey;
  let buyer1IdoTokenAccount: PublicKey;
  let buyer1CurrencyTokenAccount: PublicKey;
  let buyer2IdoTokenAccount: PublicKey;
  let buyer2CurrencyTokenAccount: PublicKey;
  
  // Pool accounts
  let poolTokenAccount: PublicKey;
  let poolCurrencyAccount: PublicKey;
  let poolAuthority: PublicKey;
  
  // Program accounts
  let configAccount: PublicKey;
  let poolAccount: PublicKey;
  let buyer1Purchase: PublicKey;
  let buyer2Purchase: PublicKey;
  
  // Pool parameters
  const poolId = new anchor.BN(1);
  const saleAmount = new anchor.BN(1000000); // 1M tokens for sale
  const pricePerToken = new anchor.BN(100); // 100 currency units per token
  
  // Time parameters
  let startTime: anchor.BN;
  let endTime: anchor.BN;
  let claimTime: anchor.BN;
  
  before(async () => {
    console.log("🚀 Setting up test environment...");
    
    // Generate keypairs
    creator = Keypair.generate();
    buyer1 = Keypair.generate();
    buyer2 = Keypair.generate();
    
    console.log("📋 Generated test accounts:");
    console.log(`   Creator: ${creator.publicKey.toString()}`);
    console.log(`   Buyer 1: ${buyer1.publicKey.toString()}`);
    console.log(`   Buyer 2: ${buyer2.publicKey.toString()}`);
    
    // Airdrop SOL to all accounts
    await provider.connection.requestAirdrop(creator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create token mints
    idoTokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6 // 6 decimals
    );
    
    currencyTokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6 // 6 decimals
    );
    
    console.log("🪙 Created token mints:");
    console.log(`   IDO Token: ${idoTokenMint.toString()}`);
    console.log(`   Currency Token: ${currencyTokenMint.toString()}`);
    
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
    
    console.log("Derived program accounts:");
    console.log(`   Config Account: ${configAccount.toString()}`);
    console.log(`   Pool Account: ${poolAccount.toString()}`);
    console.log(`   Pool Authority: ${poolAuthority.toString()}`);
    
    // Create all token accounts
    creatorIdoTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      idoTokenMint,
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
    
    // Pool token accounts - use getAssociatedTokenAddress to get the address
    // since poolAuthority is a PDA, we need allowOwnerOffCurve = true
    poolTokenAccount = await getAssociatedTokenAddress(
      idoTokenMint,
      poolAuthority,
      true // allowOwnerOffCurve = true for PDA
    );
    
    poolCurrencyAccount = await createAssociatedTokenAccount(
      provider.connection,
      creator,
      currencyTokenMint,
      creator.publicKey
    );
    
    // Mint initial tokens
    await mintTo(
      provider.connection,
      creator,
      idoTokenMint,
      creatorIdoTokenAccount,
      creator,
      10_000_000 // 10M IDO tokens to creator
    );
    
    await mintTo(
      provider.connection,
      creator,
      currencyTokenMint,
      buyer1CurrencyTokenAccount,
      creator,
      1_000_000 // 1M currency tokens to buyer1
    );
    
    await mintTo(
      provider.connection,
      creator,
      currencyTokenMint,
      buyer2CurrencyTokenAccount,
      creator,
      1_000_000 // 1M currency tokens to buyer2
    );
    
    console.log("Minted initial tokens");
    
    // Derive user purchase PDAs
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
    
    // Set up time parameters
    const now = Math.floor(Date.now() / 1000);
    startTime = new anchor.BN(now + 5); // Start in 5 seconds
    endTime = new anchor.BN(now + 20); // End in 20 seconds
    claimTime = new anchor.BN(now + 25); // Claim 5 seconds after end
    
    console.log("✅ Test environment setup complete!\n");
  });

  it("1. Should initialize the IDO platform successfully", async () => {
    console.log("🔧 Initializing IDO platform...");
    
    try {
      const tx = await program.methods
        .initialize(creator.publicKey, creator.publicKey)
        .accounts({
          signer: creator.publicKey,
          configAccount: configAccount,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
        
      // Verify initialization
      const config = await program.account.configAccount.fetch(configAccount);
      expect(config.owner.toString()).to.equal(creator.publicKey.toString());
      expect(config.creator.toString()).to.equal(creator.publicKey.toString());
      
      console.log("✅ Platform initialized successfully");
      console.log(`   Owner: ${config.owner.toString()}`);
      console.log(`   Creator: ${config.creator.toString()}\n`);
    } catch (error) {
      console.error("❌ Initialize failed:", error);
      throw error;
    }
  });

  it("2. Should create an IDO pool successfully", async () => {
    console.log("🏊 Creating IDO pool...");
    console.log(`   Pool ID: ${poolId.toString()}`);
    console.log(`   Sale Amount: ${saleAmount.toString()} tokens`);
    console.log(`   Price per Token: ${pricePerToken.toString()} currency units`);
    
    try {
      const tx = await program.methods
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
          configAccount: configAccount,
          poolAccount: poolAccount,
          currencyMint: currencyTokenMint,
          tokenMint: idoTokenMint,
          creatorTokenAccount: creatorIdoTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([creator])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
        
      // Verify pool creation
      const pool = await program.account.poolAccount.fetch(poolAccount);
      expect(pool.poolId.toString()).to.equal(poolId.toString());
      expect(pool.creator.toString()).to.equal(creator.publicKey.toString());
      expect(pool.saleAmount.toString()).to.equal(saleAmount.toString());
      expect(pool.pricePerToken.toString()).to.equal(pricePerToken.toString());
      expect(pool.currencyMint.toString()).to.equal(currencyTokenMint.toString());
      expect(pool.tokenMint.toString()).to.equal(idoTokenMint.toString());
      expect(pool.totalRaised.toString()).to.equal("0");
      expect(pool.isActive).to.be.true;
      
      console.log("✅ Pool created successfully");
      console.log(`   Start Time: ${new Date(pool.startTime.toNumber() * 1000).toISOString()}`);
      console.log(`   End Time: ${new Date(pool.endTime.toNumber() * 1000).toISOString()}`);
      console.log(`   Claim Time: ${new Date(pool.claimTime.toNumber() * 1000).toISOString()}\n`);
    } catch (error) {
      console.error("❌ Create pool failed:", error);
      throw error;
    }
  });

  it("3. Should fund the pool with IDO tokens successfully", async () => {
    console.log("💰 Funding pool with IDO tokens...");
    
    try {
      // Check creator's token balance before funding
      const creatorAccountBefore = await getAccount(provider.connection, creatorIdoTokenAccount);
      console.log(`   Creator balance before: ${creatorAccountBefore.amount.toString()}`);
      
      // Create the pool token account first (since it's owned by a PDA)
      console.log("   Creating pool token account...");
      console.log(`   Pool token account address: ${poolTokenAccount.toString()}`);
      console.log(`   Pool authority: ${poolAuthority.toString()}`);
      
      try {
        // Check if account already exists first
        const accountInfo = await provider.connection.getAccountInfo(poolTokenAccount);
        if (accountInfo) {
          console.log("   ℹ️ Pool token account already exists");
        } else {
          // Create the associated token account manually using instruction
          const createATAInstruction = createAssociatedTokenAccountInstruction(
            creator.publicKey, // payer
            poolTokenAccount, // associatedToken
            poolAuthority, // owner (PDA)
            idoTokenMint, // mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          
          const transaction = new Transaction().add(createATAInstruction);
          
          const signature = await provider.sendAndConfirm(transaction, [creator]);
          console.log("   ✅ Pool token account created successfully");
          console.log(`   Transaction signature: ${signature}`);
        }
      } catch (error) {
        console.log("   ❌ Pool token account creation failed:", error.message);
        throw error;
      }
      
      const tx = await program.methods
        .fundPool(poolId, saleAmount)
        .accounts({
          creator: creator.publicKey,
          poolAccount: poolAccount,
          creatorTokenAccount: creatorIdoTokenAccount,
          poolTokenAccount: poolTokenAccount,
          poolAuthority: poolAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([creator])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
      
      // Verify tokens were transferred
      const creatorAccountAfter = await getAccount(provider.connection, creatorIdoTokenAccount);
      const poolAccountAfter = await getAccount(provider.connection, poolTokenAccount);
      
      expect(creatorAccountAfter.amount.toString()).to.equal(
        (creatorAccountBefore.amount - BigInt(saleAmount.toString())).toString()
      );
      expect(poolAccountAfter.amount.toString()).to.equal(saleAmount.toString());
      
      console.log("✅ Pool funded successfully");
      console.log(`   Creator balance after: ${creatorAccountAfter.amount.toString()}`);
      console.log(`   Pool balance: ${poolAccountAfter.amount.toString()}\n`);
    } catch (error) {
      console.error("❌ Fund pool failed:", error);
      throw error;
    }
  });

  it("4. Should allow buyer1 to purchase tokens successfully", async () => {
    console.log("🛒 Buyer1 purchasing tokens...");
    
    // Wait for sale to start
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const currencyAmount = new anchor.BN(50000); // 50k currency units
    const expectedTokens = currencyAmount.div(pricePerToken); // 500 tokens
    
    console.log(`   Currency amount: ${currencyAmount.toString()}`);
    console.log(`   Expected tokens: ${expectedTokens.toString()}`);
    
    try {
      // Check balances before purchase
      const buyer1CurrencyBefore = await getAccount(provider.connection, buyer1CurrencyTokenAccount);
      console.log(`   Buyer1 currency balance before: ${buyer1CurrencyBefore.amount.toString()}`);
      
      const tx = await program.methods
        .buyTokens(poolId, currencyAmount)
        .accounts({
          buyer: buyer1.publicKey,
          poolAccount: poolAccount,
          userPurchase: buyer1Purchase,
          buyerCurrencyAccount: buyer1CurrencyTokenAccount,
          poolCurrencyAccount: poolCurrencyAccount,
          currencyMint: currencyTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([buyer1])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
      
      // Verify purchase
      const userPurchase = await program.account.userPurchase.fetch(buyer1Purchase);
      const poolAfterPurchase = await program.account.poolAccount.fetch(poolAccount);
      const buyer1CurrencyAfter = await getAccount(provider.connection, buyer1CurrencyTokenAccount);
      
      expect(userPurchase.user.toString()).to.equal(buyer1.publicKey.toString());
      expect(userPurchase.poolId.toString()).to.equal(poolId.toString());
      expect(userPurchase.amountPurchased.toString()).to.equal(currencyAmount.toString());
      expect(userPurchase.tokensToClaim.toString()).to.equal(expectedTokens.toString());
      expect(userPurchase.hasClaimed).to.be.false;
      
      expect(poolAfterPurchase.totalRaised.toString()).to.equal(currencyAmount.toString());
      
      expect(buyer1CurrencyAfter.amount.toString()).to.equal(
        (buyer1CurrencyBefore.amount - BigInt(currencyAmount.toString())).toString()
      );
      
      console.log("✅ Buyer1 purchase successful");
      console.log(`   Tokens to claim: ${userPurchase.tokensToClaim.toString()}`);
      console.log(`   Pool total raised: ${poolAfterPurchase.totalRaised.toString()}\n`);
    } catch (error) {
      console.error("❌ Buy tokens failed:", error);
      throw error;
    }
  });

  it("5. Should allow buyer2 to purchase tokens successfully", async () => {
    console.log("🛒 Buyer2 purchasing tokens...");
    
    const currencyAmount = new anchor.BN(30000); // 30k currency units
    const expectedTokens = currencyAmount.div(pricePerToken); // 300 tokens
    
    console.log(`   Currency amount: ${currencyAmount.toString()}`);
    console.log(`   Expected tokens: ${expectedTokens.toString()}`);
    
    try {
      // Check pool total raised before buyer2's purchase
      const poolBeforePurchase = await program.account.poolAccount.fetch(poolAccount);
      const previousTotalRaised = poolBeforePurchase.totalRaised;
      
      const tx = await program.methods
        .buyTokens(poolId, currencyAmount)
        .accounts({
          buyer: buyer2.publicKey,
          poolAccount: poolAccount,
          userPurchase: buyer2Purchase,
          buyerCurrencyAccount: buyer2CurrencyTokenAccount,
          poolCurrencyAccount: poolCurrencyAccount,
          currencyMint: currencyTokenMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([buyer2])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
      
      // Verify purchase
      const userPurchase = await program.account.userPurchase.fetch(buyer2Purchase);
      const poolAfterPurchase = await program.account.poolAccount.fetch(poolAccount);
      
      expect(userPurchase.user.toString()).to.equal(buyer2.publicKey.toString());
      expect(userPurchase.poolId.toString()).to.equal(poolId.toString());
      expect(userPurchase.amountPurchased.toString()).to.equal(currencyAmount.toString());
      expect(userPurchase.tokensToClaim.toString()).to.equal(expectedTokens.toString());
      expect(userPurchase.hasClaimed).to.be.false;
      
      const expectedTotalRaised = previousTotalRaised.add(currencyAmount);
      expect(poolAfterPurchase.totalRaised.toString()).to.equal(expectedTotalRaised.toString());
      
      console.log("✅ Buyer2 purchase successful");
      console.log(`   Tokens to claim: ${userPurchase.tokensToClaim.toString()}`);
      console.log(`   Pool total raised: ${poolAfterPurchase.totalRaised.toString()}\n`);
    } catch (error) {
      console.error("❌ Buyer2 purchase failed:", error);
      throw error;
    }
  });

  it("6. Should allow buyer1 to claim tokens successfully", async () => {
    console.log("🎁 Buyer1 claiming tokens...");
    
    // Wait for claim time
    console.log("   Waiting for claim time...");
    const currentTime = Math.floor(Date.now() / 1000);
    const claimTimeNumber = claimTime.toNumber();
    console.log(`   Current time: ${currentTime}`);
    console.log(`   Claim time: ${claimTimeNumber}`);
    
    if (currentTime < claimTimeNumber) {
      const waitTime = (claimTimeNumber - currentTime + 2) * 1000; // Add 2 seconds buffer
      console.log(`   Need to wait ${waitTime / 1000} seconds for claim time`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      console.log("   Claim time has already passed");
    }
    
    try {
      // Get buyer1's purchase info
      const purchaseBefore = await program.account.userPurchase.fetch(buyer1Purchase);
      const tokensToClaim = purchaseBefore.tokensToClaim;
      
      console.log(`   Tokens to claim: ${tokensToClaim.toString()}`);
      
      // Check buyer1's IDO token balance before claim
      const buyer1IdoBalanceBefore = await getAccount(provider.connection, buyer1IdoTokenAccount);
      
      const tx = await program.methods
        .claimTokens(poolId)
        .accounts({
          claimer: buyer1.publicKey,
          poolAccount: poolAccount,
          userPurchase: buyer1Purchase,
          claimerTokenAccount: buyer1IdoTokenAccount,
          poolTokenAccount: poolTokenAccount,
          tokenMint: idoTokenMint,
          poolAuthority: poolAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([buyer1])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
      
      // Verify claim
      const purchaseAfter = await program.account.userPurchase.fetch(buyer1Purchase);
      const buyer1IdoBalanceAfter = await getAccount(provider.connection, buyer1IdoTokenAccount);
      
      expect(purchaseAfter.hasClaimed).to.be.true;
      expect(buyer1IdoBalanceAfter.amount.toString()).to.equal(
        (buyer1IdoBalanceBefore.amount + BigInt(tokensToClaim.toString())).toString()
      );
      
      console.log("✅ Buyer1 claimed tokens successfully");
      console.log(`   IDO tokens received: ${tokensToClaim.toString()}`);
      console.log(`   New IDO balance: ${buyer1IdoBalanceAfter.amount.toString()}\n`);
    } catch (error) {
      console.error("❌ Claim tokens failed:", error);
      throw error;
    }
  });

  it("7. Should allow buyer2 to claim tokens successfully", async () => {
    console.log("🎁 Buyer2 claiming tokens...");
    
    try {
      // Get buyer2's purchase info
      const purchaseBefore = await program.account.userPurchase.fetch(buyer2Purchase);
      const tokensToClaim = purchaseBefore.tokensToClaim;
      
      console.log(`   Tokens to claim: ${tokensToClaim.toString()}`);
      
      // Check buyer2's IDO token balance before claim
      const buyer2IdoBalanceBefore = await getAccount(provider.connection, buyer2IdoTokenAccount);
      
      const tx = await program.methods
        .claimTokens(poolId)
        .accounts({
          claimer: buyer2.publicKey,
          poolAccount: poolAccount,
          userPurchase: buyer2Purchase,
          claimerTokenAccount: buyer2IdoTokenAccount,
          poolTokenAccount: poolTokenAccount,
          tokenMint: idoTokenMint,
          poolAuthority: poolAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([buyer2])
        .rpc();
        
      console.log(`   Transaction: ${tx}`);
      
      // Verify claim
      const purchaseAfter = await program.account.userPurchase.fetch(buyer2Purchase);
      const buyer2IdoBalanceAfter = await getAccount(provider.connection, buyer2IdoTokenAccount);
      
      expect(purchaseAfter.hasClaimed).to.be.true;
      expect(buyer2IdoBalanceAfter.amount.toString()).to.equal(
        (buyer2IdoBalanceBefore.amount + BigInt(tokensToClaim.toString())).toString()
      );
      
      console.log("✅ Buyer2 claimed tokens successfully");
      console.log(`   IDO tokens received: ${tokensToClaim.toString()}`);
      console.log(`   New IDO balance: ${buyer2IdoBalanceAfter.amount.toString()}\n`);
    } catch (error) {
      console.error("❌ Buyer2 claim failed:", error);
      throw error;
    }
  });

  it("8. Should verify final state of all accounts", async () => {
    console.log("🔍 Verifying final state...");
    
    try {
      // Get final pool state
      const finalPoolState = await program.account.poolAccount.fetch(poolAccount);
      
      // Get final user purchase states
      const buyer1FinalPurchase = await program.account.userPurchase.fetch(buyer1Purchase);
      const buyer2FinalPurchase = await program.account.userPurchase.fetch(buyer2Purchase);
      
      // Get final token balances
      const poolTokenBalance = await getAccount(provider.connection, poolTokenAccount);
      const buyer1IdoBalance = await getAccount(provider.connection, buyer1IdoTokenAccount);
      const buyer2IdoBalance = await getAccount(provider.connection, buyer2IdoTokenAccount);
      
      console.log("📊 Final State Summary:");
      console.log(`   Pool total raised: ${finalPoolState.totalRaised.toString()} currency tokens`);
      console.log(`   Pool remaining tokens: ${poolTokenBalance.amount.toString()} IDO tokens`);
      console.log(`   Buyer1 claimed: ${buyer1FinalPurchase.hasClaimed}`);
      console.log(`   Buyer1 IDO balance: ${buyer1IdoBalance.amount.toString()}`);
      console.log(`   Buyer2 claimed: ${buyer2FinalPurchase.hasClaimed}`);
      console.log(`   Buyer2 IDO balance: ${buyer2IdoBalance.amount.toString()}`);
      
      // Verify both users have claimed
      expect(buyer1FinalPurchase.hasClaimed).to.be.true;
      expect(buyer2FinalPurchase.hasClaimed).to.be.true;
      
      // Verify token distribution
      const totalTokensClaimed = buyer1FinalPurchase.tokensToClaim.add(buyer2FinalPurchase.tokensToClaim);
      const expectedRemainingTokens = saleAmount.sub(totalTokensClaimed);
      
      expect(poolTokenBalance.amount.toString()).to.equal(expectedRemainingTokens.toString());
      
      console.log("✅ All verifications passed!\n");
    } catch (error) {
      console.error("❌ Final verification failed:", error);
      throw error;
    }
  });

  after(() => {
    console.log("🎉 All Happy Case Tests Completed Successfully!");
    console.log("\n📋 Test Summary:");
    console.log("   ✅ Platform initialization");
    console.log("   ✅ Pool creation with time constraints");
    console.log("   ✅ Pool funding with IDO tokens");
    console.log("   ✅ Multiple token purchases");
    console.log("   ✅ Token claiming after claim time");
    console.log("   ✅ Final state verification");
    console.log("\n🚀 Solana IDO system is working perfectly!");
  });
}); 