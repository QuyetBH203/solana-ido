# Solana IDO Pool Management System

Hệ thống quản lý pool cho Solana IDO với đầy đủ các chức năng bạn yêu cầu:

## Tính năng chính

### 1. Tạo Pool (Create Pool)
- **Thời gian bắt đầu** (start_time): Thời điểm bắt đầu bán token
- **Thời gian kết thúc** (end_time): Thời điểm kết thúc bán token  
- **Thời gian claim** (claim_time): Thời điểm cho phép claim token
- **Số lượng bán** (sale_amount): Tổng số token IDO để bán
- **Giá bán** (price_per_token): Giá mỗi token IDO (bằng currency token)
- **Currency token**: Loại SPL token dùng để thanh toán
- **Theo dõi mua hàng**: Tracking số lượng mỗi user đã mua

### 2. Cấu trúc dữ liệu

#### PoolAccount
```rust
pub struct PoolAccount {
    pub pool_id: u64,           // ID của pool
    pub creator: Pubkey,        // Người tạo pool
    pub start_time: i64,        // Thời gian bắt đầu
    pub end_time: i64,          // Thời gian kết thúc
    pub claim_time: i64,        // Thời gian claim
    pub sale_amount: u64,       // Tổng token để bán
    pub price_per_token: u64,   // Giá mỗi token
    pub currency_mint: Pubkey,  // SPL token để thanh toán
    pub token_mint: Pubkey,     // IDO token mint
    pub total_raised: u64,      // Tổng currency đã thu
    pub is_active: bool,        // Pool có active không
    pub bump: u8,
}
```

#### UserPurchase
```rust
pub struct UserPurchase {
    pub user: Pubkey,           // Địa chỉ user
    pub pool_id: u64,           // ID pool
    pub amount_purchased: u64,   // Số currency đã mua
    pub tokens_to_claim: u64,   // Số token IDO sẽ nhận
    pub has_claimed: bool,      // Đã claim chưa
    pub bump: u8,
}
```

## Các chức năng

### 1. `create_pool` - Tạo pool mới
```rust
pub fn create_pool(
    ctx: Context<CreatePool>,
    pool_id: u64,
    start_time: i64,      // Unix timestamp
    end_time: i64,        // Unix timestamp  
    claim_time: i64,      // Unix timestamp
    sale_amount: u64,     // Số token để bán
    price_per_token: u64, // Giá mỗi token
) -> Result<()>
```

**Validation:**
- `start_time` phải > thời gian hiện tại
- `end_time` phải > `start_time`
- `claim_time` phải >= `end_time`
- `sale_amount` và `price_per_token` phải > 0
- Creator phải có đủ token IDO

### 2. `fund_pool` - Nạp token IDO vào pool
```rust
pub fn fund_pool(
    ctx: Context<FundPool>,
    pool_id: u64,
    amount: u64,    // Phải = sale_amount
) -> Result<()>
```

### 3. `buy_tokens` - Mua token trong thời gian sale
```rust
pub fn buy_tokens(
    ctx: Context<BuyTokens>,
    pool_id: u64,
    currency_amount: u64,  // Số currency token để thanh toán
) -> Result<()>
```

**Validation:**
- Phải trong thời gian sale (start_time <= now <= end_time)
- Pool phải active
- Đủ token còn lại để bán
- User có đủ currency token

### 4. `claim_tokens` - Claim token IDO sau khi sale kết thúc
```rust
pub fn claim_tokens(
    ctx: Context<ClaimTokens>,
    pool_id: u64,
) -> Result<()>
```

**Validation:**
- Phải >= claim_time
- User chưa claim
- User có token để claim

## Cách sử dụng

### 1. Khởi tạo platform
```typescript
await program.methods
  .initialize(owner.publicKey, creator.publicKey)
  .accounts({
    signer: creator.publicKey,
    configAccount,
    systemProgram: SystemProgram.programId,
  })
  .signers([creator])
  .rpc();
```

### 2. Tạo pool
```typescript
const poolId = new anchor.BN(1);
const startTime = new anchor.BN(Math.floor(Date.now() / 1000) + 3600); // 1 giờ sau
const endTime = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);   // 1 ngày sau
const claimTime = new anchor.BN(Math.floor(Date.now() / 1000) + 172800); // 2 ngày sau
const saleAmount = new anchor.BN(1000000); // 1M tokens
const pricePerToken = new anchor.BN(100);  // 100 currency units per token

await program.methods
  .createPool(poolId, startTime, endTime, claimTime, saleAmount, pricePerToken)
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
```

### 3. Nạp token vào pool
```typescript
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
```

### 4. Mua token
```typescript
const purchaseAmount = new anchor.BN(50000); // 50k currency tokens

await program.methods
  .buyTokens(poolId, purchaseAmount)
  .accounts({
    buyer: buyer.publicKey,
    poolAccount,
    userPurchase,
    buyerCurrencyAccount,
    poolCurrencyAccount,
    currencyMint: currencyTokenMint,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([buyer])
  .rpc();
```

### 5. Claim token
```typescript
await program.methods
  .claimTokens(poolId)
  .accounts({
    claimer: buyer.publicKey,
    poolAccount,
    userPurchase,
    claimerTokenAccount,
    poolTokenAccount,
    tokenMint: idoTokenMint,
    poolAuthority,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([buyer])
  .rpc();
```

## PDA Seeds

- **Config Account**: `["ido_platform_seed"]`
- **Pool Account**: `["pool", pool_id.to_le_bytes()]`
- **Pool Authority**: `["pool_authority", pool_id.to_le_bytes()]`
- **User Purchase**: `["user_purchase", user_pubkey, pool_id.to_le_bytes()]`

## Error Codes

- `UnauthorizedCreator`: Không phải creator của pool
- `InvalidStartTime`: Thời gian bắt đầu không hợp lệ
- `InvalidEndTime`: Thời gian kết thúc không hợp lệ
- `InvalidClaimTime`: Thời gian claim không hợp lệ
- `SaleNotStarted`: Sale chưa bắt đầu
- `SaleEnded`: Sale đã kết thúc
- `PoolNotActive`: Pool không active
- `ClaimNotAvailable`: Chưa đến thời gian claim
- `AlreadyClaimed`: Đã claim rồi
- `NothingToClaim`: Không có gì để claim

## Dependencies

Thêm vào `Cargo.toml`:
```toml
[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

## Tóm tắt

Hệ thống này cung cấp đầy đủ các chức năng bạn yêu cầu:
✅ Quản lý thời gian bắt đầu, kết thúc, claim
✅ Cấu hình số lượng bán và giá bán
✅ Hỗ trợ SPL token làm currency
✅ Tracking số lượng mỗi user đã mua
✅ Bảo mật với PDA và validation đầy đủ
✅ Test cases hoàn chỉnh 