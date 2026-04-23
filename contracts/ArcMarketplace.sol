// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ═══════════════════════════════════════════════════════════
 *   ArcMarketplace — E-Commerce on Arc by Circle
 * ═══════════════════════════════════════════════════════════
 *
 *   Stablecoin-native marketplace with:
 *   - Escrow payments (buyer deposits, held until delivery)
 *   - Split payments (seller + platform fee in one tx)
 *   - Auto-refund on shipping timeout
 *   - Dispute resolution with ERC-8004 agent arbitration
 *   - Multi-currency checkout via StableFX (USDC, EURC, USYC)
 *   - ERC-8004 identity for sellers and agents
 *
 *   Built for Arc Testnet (chainId: 248022208)
 *   USDC native gas | Sub-second finality | Circle Wallets
 */

import "./IERC8004.sol";

// ─── Interfaces ───

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IStableFXEngine {
    function executeSwap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut);
}

// ─── Data Structures ───

enum OrderStatus {
    NONE,           // 0 — does not exist
    CREATED,        // 1 — buyer deposited funds
    SHIPPED,        // 2 — seller marked as shipped
    DELIVERED,      // 3 — buyer confirmed delivery → payment released
    DISPUTED,       // 4 — dispute opened
    RESOLVED,       // 5 — dispute resolved by agent
    REFUNDED,       // 6 — auto-refund (timeout) or dispute resolution
    CANCELLED       // 7 — cancelled before shipment
}

struct Order {
    uint256 id;
    address buyer;
    address seller;
    address paymentToken;
    address settlementToken;
    uint256 amount;
    uint256 settlementAmount;
    uint256 platformFee;
    OrderStatus status;
    uint256 createdAt;
    uint256 shippedAt;
    uint256 disputeDeadline;
    uint256 disputeExpiresAt;
}

struct Dispute {
    uint256 orderId;
    address opener;
    uint256 createdAt;
    bool resolved;
    address winner;
}

struct Listing {
    uint256 id;
    address seller;
    address paymentToken;
    uint256 price;
    bool active;
    uint256 createdAt;
    uint256 soldCount;
}

struct SellerProfile {
    bool registered;
    uint256 totalSales;
    uint256 totalOrders;
    uint256 disputeCount;
    uint256 reputationScore; // 0-10000 (ERC-8004 style)
}

// ─── Events ───

event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price, string title);
event ListingUpdated(uint256 indexed listingId, uint256 newPrice);
event ListingDelisted(uint256 indexed listingId);
event ListingPurchased(uint256 indexed listingId, uint256 indexed orderId, address indexed buyer, uint256 amount);
event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 amount, string productId);
event OrderShipped(uint256 indexed orderId, string trackingURI);
event OrderDelivered(uint256 indexed orderId, uint256 sellerPayout, uint256 platformFee);
event OrderDisputed(uint256 indexed orderId, address opener, string reason);
event DisputeResolved(uint256 indexed orderId, address winner, string resolutionURI);
event OrderRefunded(uint256 indexed orderId, uint256 amount);
event OrderCancelled(uint256 indexed orderId);
event SellerRegistered(address indexed seller, string metadataURI);
event SellerReputationUpdated(address indexed seller, uint256 score);

// ─── Contract ───

contract ArcMarketplace {
    // ─── Immutable / Constants ───
    address public immutable owner;
    address public immutable identityRegistry;
    address public immutable fxEngine;
    address public immutable USDC;
    address public immutable EURC;
    address public immutable USYC;

    uint256 public platformFeeBps;      // e.g. 250 = 2.5%
    uint256 public escrowTimeout;       // seconds before auto-refund
    uint256 public disputeTimeout;      // seconds for dispute resolution

    // ─── State ───
    uint256 public nextOrderId = 1;
    uint256 public nextListingId = 1;
    uint256 public totalVolume;
    uint256 public totalFeesCollected;

    mapping(uint256 => Order) internal orders;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => Listing) public listings;
    mapping(address => SellerProfile) public sellers;
    mapping(address => bool) public authorizedAgents;
    mapping(address => uint256[]) public sellerListingIds;

    // String fields stored separately to avoid stack-too-deep
    mapping(uint256 => string) public orderProductId;
    mapping(uint256 => string) public orderTrackingURI;
    mapping(uint256 => string) public disputeReason;
    mapping(uint256 => string) public disputeResolutionURI;
    mapping(uint256 => string) public listingTitle;
    mapping(uint256 => string) public listingDescription;
    mapping(uint256 => string) public listingImageURI;
    mapping(uint256 => string) public listingCategory;

    bool public killed;

    // ─── Modifiers ───
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notKilled() {
        require(!killed, "Contract killed");
        _;
    }

    modifier onlyBuyer(uint256 orderId) {
        require(orders[orderId].buyer == msg.sender, "Not buyer");
        _;
    }

    modifier onlySeller(uint256 orderId) {
        require(orders[orderId].seller == msg.sender, "Not seller");
        _;
    }

    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    modifier orderExists(uint256 orderId) {
        require(orders[orderId].status != OrderStatus.NONE, "Order does not exist");
        _;
    }

    // ─── Constructor ───
    constructor(
        address _identityRegistry,
        address _fxEngine,
        address _usdc,
        address _eurc,
        address _usyc,
        uint256 _platformFeeBps,
        uint256 _escrowTimeout,
        uint256 _disputeTimeout
    ) {
        owner = msg.sender;
        identityRegistry = _identityRegistry;
        fxEngine = _fxEngine;
        USDC = _usdc;
        EURC = _eurc;
        USYC = _usyc;
        platformFeeBps = _platformFeeBps;
        escrowTimeout = _escrowTimeout;
        disputeTimeout = _disputeTimeout;
    }

    // ═══════════════════════════════════════
    //   SELLER REGISTRATION
    // ═══════════════════════════════════════

    /**
     * Register as a seller on the marketplace.
     * Optionally link to ERC-8004 identity for reputation.
     */
    function registerSeller(string calldata metadataURI) external notKilled {
        require(!sellers[msg.sender].registered, "Already registered");
        SellerProfile storage s = sellers[msg.sender];
        s.registered = true;
        s.reputationScore = 5000;
        emit SellerRegistered(msg.sender, metadataURI);
    }

    // ═══════════════════════════════════════
    //   LISTINGS
    // ═══════════════════════════════════════

    /**
     * Create a new listing. Caller must be a registered seller.
     * @param paymentToken  Token accepted (USDC, EURC, USYC)
     * @param price         Price in token decimals
     * @param title         Product title
     * @param description   Product description
     * @param imageURI      Image URL or IPFS hash
     * @param category      Product category
     */
    function listItem(
        address paymentToken,
        uint256 price,
        string calldata title,
        string calldata description,
        string calldata imageURI,
        string calldata category
    ) external notKilled returns (uint256) {
        require(sellers[msg.sender].registered, "Not a registered seller");
        require(price > 0, "Price must be > 0");
        require(_isValidToken(paymentToken), "Unsupported token");
        require(bytes(title).length > 0, "Title required");

        uint256 listingId = nextListingId++;

        Listing storage l = listings[listingId];
        l.id = listingId;
        l.seller = msg.sender;
        l.paymentToken = paymentToken;
        l.price = price;
        l.active = true;
        l.createdAt = block.timestamp;

        listingTitle[listingId] = title;
        listingDescription[listingId] = description;
        listingImageURI[listingId] = imageURI;
        listingCategory[listingId] = category;

        sellerListingIds[msg.sender].push(listingId);

        emit ListingCreated(listingId, msg.sender, price, title);
        return listingId;
    }

    /**
     * Buy a listing — transfers payment to escrow and creates an order.
     * Buyer must have approved the marketplace to spend paymentToken.
     * @param listingId      The listing to purchase
     * @param settlementToken Token seller wants to receive (may differ via FX)
     */
    function buyItem(
        uint256 listingId,
        address settlementToken
    ) external notKilled returns (uint256) {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller != msg.sender, "Cannot buy own listing");
        require(_isValidToken(settlementToken), "Unsupported settlement token");

        // Transfer payment from buyer to escrow
        require(
            IERC20(listing.paymentToken).transferFrom(msg.sender, address(this), listing.price),
            "Payment transfer failed"
        );

        string memory prodId = string(abi.encodePacked("LISTING-", _uintToString(listingId)));
        uint256 orderId = _createOrder(
            listing.seller,
            listing.paymentToken,
            settlementToken,
            listing.price,
            prodId
        );

        listing.soldCount++;
        sellers[listing.seller].totalOrders++;

        emit ListingPurchased(listingId, orderId, msg.sender, listing.price);
        return orderId;
    }

    /**
     * Delist an item (seller only).
     */
    function delistItem(uint256 listingId) external notKilled {
        Listing storage listing = listings[listingId];
        require(listing.seller == msg.sender, "Not your listing");
        require(listing.active, "Already delisted");
        listing.active = false;
        emit ListingDelisted(listingId);
    }

    /**
     * Update listing price (seller only).
     */
    function updateListingPrice(uint256 listingId, uint256 newPrice) external notKilled {
        Listing storage listing = listings[listingId];
        require(listing.seller == msg.sender, "Not your listing");
        require(listing.active, "Listing not active");
        require(newPrice > 0, "Price must be > 0");
        listing.price = newPrice;
        emit ListingUpdated(listingId, newPrice);
    }

    /**
     * Relist a previously delisted item (seller only).
     */
    function relistItem(uint256 listingId, uint256 newPrice) external notKilled {
        Listing storage listing = listings[listingId];
        require(listing.seller == msg.sender, "Not your listing");
        require(!listing.active, "Already active");
        require(newPrice > 0, "Price must be > 0");
        listing.price = newPrice;
        listing.active = true;
        emit ListingUpdated(listingId, newPrice);
    }

    // ═══════════════════════════════════════
    //   ORDER LIFECYCLE
    // ═══════════════════════════════════════

    /**
     * Buyer creates an order by depositing payment into escrow.
     * @param seller         Seller's wallet address
     * @param paymentToken   Token to pay with (USDC, EURC, USYC)
     * @param settlementToken Token seller wants to receive (may differ)
     * @param amount         Payment amount in token decimals
     * @param productId      Off-chain product identifier
     */
    function createOrder(
        address seller,
        address paymentToken,
        address settlementToken,
        uint256 amount,
        string calldata productId
    ) external notKilled returns (uint256) {
        require(sellers[seller].registered, "Seller not registered");
        require(amount > 0, "Amount must be > 0");
        require(
            _isValidToken(paymentToken) && _isValidToken(settlementToken),
            "Unsupported token"
        );

        // Transfer payment from buyer to escrow
        require(
            IERC20(paymentToken).transferFrom(msg.sender, address(this), amount),
            "Payment transfer failed"
        );

        uint256 orderId = _createOrder(seller, paymentToken, settlementToken, amount, productId);

        sellers[seller].totalOrders++;

        return orderId;
    }

    /**
     * Seller marks order as shipped with tracking info.
     */
    function markShipped(
        uint256 orderId,
        string calldata trackingURI
    ) external orderExists(orderId) onlySeller(orderId) notKilled {
        require(orders[orderId].status == OrderStatus.CREATED, "Order not in created state");
        require(block.timestamp <= orders[orderId].disputeDeadline, "Escrow timeout exceeded");

        orders[orderId].status = OrderStatus.SHIPPED;
        orders[orderId].shippedAt = block.timestamp;
        orderTrackingURI[orderId] = trackingURI;
        orders[orderId].disputeExpiresAt = block.timestamp + disputeTimeout;

        emit OrderShipped(orderId, trackingURI);
    }

    /**
     * Buyer confirms delivery → payment released to seller + platform fee.
     * If payment and settlement tokens differ, FX conversion happens here.
     */
    function confirmDelivery(
        uint256 orderId
    ) external orderExists(orderId) onlyBuyer(orderId) notKilled {
        require(orders[orderId].status == OrderStatus.SHIPPED, "Order not shipped");
        orders[orderId].status = OrderStatus.DELIVERED;
        _settlePayment(orderId);
        emit OrderDelivered(orderId, orders[orderId].settlementAmount, orders[orderId].platformFee);
    }

    /**
     * Buyer or seller opens a dispute.
     */
    function openDispute(
        uint256 orderId,
        string calldata reason
    ) external orderExists(orderId) notKilled {
        uint8 s = uint8(orders[orderId].status);
        require(s == uint8(OrderStatus.CREATED) || s == uint8(OrderStatus.SHIPPED), "Order not disputable");
        require(msg.sender == orders[orderId].buyer || msg.sender == orders[orderId].seller, "Not buyer or seller");

        orders[orderId].status = OrderStatus.DISPUTED;
        orders[orderId].disputeExpiresAt = block.timestamp + disputeTimeout;

        disputes[orderId].orderId = orderId;
        disputes[orderId].opener = msg.sender;
        disputeReason[orderId] = reason;
        disputes[orderId].createdAt = block.timestamp;

        sellers[orders[orderId].seller].disputeCount++;

        emit OrderDisputed(orderId, msg.sender, reason);
    }

    /**
     * Authorized agent resolves a dispute.
     * @param winner  Address of the winning party (buyer = refund, seller = payout)
     */
    function resolveDispute(
        uint256 orderId,
        address winner,
        string calldata resolutionURI
    ) external orderExists(orderId) onlyAgent notKilled {
        _resolveDisputeInternal(orderId, winner, resolutionURI);
    }

    function _resolveDisputeInternal(
        uint256 orderId,
        address winner,
        string calldata resolutionURI
    ) internal {
        require(orders[orderId].status == OrderStatus.DISPUTED, "Order not disputed");
        address buyer = orders[orderId].buyer;
        address seller = orders[orderId].seller;
        require(winner == buyer || winner == seller, "Winner must be buyer or seller");

        disputes[orderId].resolved = true;
        disputes[orderId].winner = winner;
        disputeResolutionURI[orderId] = resolutionURI;
        orders[orderId].status = OrderStatus.RESOLVED;

        if (winner == buyer) {
            _refundBuyer(orderId);
            _updateReputation(seller, -200);
        } else {
            _settlePayment(orderId);
            _updateReputation(seller, 100);
        }

        emit DisputeResolved(orderId, winner, resolutionURI);
    }

    /**
     * Cancel an order before it's shipped (buyer only).
     */
    function cancelOrder(
        uint256 orderId
    ) external orderExists(orderId) onlyBuyer(orderId) notKilled {
        require(orders[orderId].status == OrderStatus.CREATED, "Can only cancel before shipment");
        orders[orderId].status = OrderStatus.CANCELLED;
        _refundBuyer(orderId);
        emit OrderCancelled(orderId);
    }

    /**
     * Anyone can trigger auto-refund if seller didn't ship in time.
     */
    function claimTimeout(
        uint256 orderId
    ) external orderExists(orderId) notKilled {
        require(orders[orderId].status == OrderStatus.CREATED, "Order not in created state");
        require(block.timestamp > orders[orderId].disputeDeadline, "Timeout not reached");
        orders[orderId].status = OrderStatus.REFUNDED;
        _refundBuyer(orderId);
        _updateReputation(orders[orderId].seller, -300);
        emit OrderRefunded(orderId, orders[orderId].amount);
    }

    /**
     * Anyone can trigger dispute timeout refund if agent didn't resolve.
     */
    function claimDisputeTimeout(
        uint256 orderId
    ) external orderExists(orderId) notKilled {
        require(orders[orderId].status == OrderStatus.DISPUTED, "Order not disputed");
        require(block.timestamp > orders[orderId].disputeExpiresAt, "Dispute timeout not reached");
        orders[orderId].status = OrderStatus.REFUNDED;
        _refundBuyer(orderId);
        emit OrderRefunded(orderId, orders[orderId].amount);
    }

    // ═══════════════════════════════════════
    //   INTERNAL HELPERS
    // ═══════════════════════════════════════

    /**
     * Create an order in storage field-by-field to avoid stack-too-deep.
     */
    function _createOrder(
        address seller,
        address paymentToken,
        address settlementToken,
        uint256 amount,
        string memory productId
    ) internal returns (uint256) {
        uint256 orderId = nextOrderId++;
        Order storage o = orders[orderId];
        o.id = orderId;
        o.buyer = msg.sender;
        o.seller = seller;
        o.paymentToken = paymentToken;
        o.settlementToken = settlementToken;
        o.amount = amount;
        o.status = OrderStatus.CREATED;
        o.createdAt = block.timestamp;
        o.disputeDeadline = block.timestamp + escrowTimeout;

        orderProductId[orderId] = productId;

        emit OrderCreated(orderId, msg.sender, seller, amount, productId);
        return orderId;
    }

    // ═══════════════════════════════════════
    //   INTERNAL SETTLEMENT
    // ═══════════════════════════════════════

    /**
     * Settle payment: FX convert if needed, deduct platform fee, pay seller.
     */
    function _settlePayment(uint256 orderId) internal {
        uint256 converted = _convertAmount(orderId);
        _distributePayment(orderId, converted);
    }

    function _convertAmount(uint256 orderId) internal returns (uint256) {
        address payToken = orders[orderId].paymentToken;
        address setToken = orders[orderId].settlementToken;
        uint256 amount = orders[orderId].amount;

        if (payToken == setToken) return amount;

        require(IERC20(payToken).transfer(address(fxEngine), amount), "FX transfer failed");
        return IStableFXEngine(fxEngine).executeSwap(payToken, setToken, amount, 0, address(this));
    }

    function _distributePayment(uint256 orderId, uint256 convertedAmount) internal {
        uint256 fee = (convertedAmount * platformFeeBps) / 10000;
        uint256 sellerPayout = convertedAmount - fee;
        address setToken = orders[orderId].settlementToken;

        require(IERC20(setToken).transfer(orders[orderId].seller, sellerPayout), "Seller payout failed");
        if (fee > 0) {
            require(IERC20(setToken).transfer(owner, fee), "Platform fee transfer failed");
        }

        orders[orderId].settlementAmount = sellerPayout;
        orders[orderId].platformFee = fee;
        totalVolume += orders[orderId].amount;
        totalFeesCollected += fee;
        sellers[orders[orderId].seller].totalSales += sellerPayout;
        _updateReputation(orders[orderId].seller, 50);
    }

    /**
     * Refund buyer in original payment token.
     */
    function _refundBuyer(uint256 orderId) internal {
        require(
            IERC20(orders[orderId].paymentToken).transfer(orders[orderId].buyer, orders[orderId].amount),
            "Refund failed"
        );
    }

    /**
     * Update seller reputation score (bounded 0-10000).
     */
    function _updateReputation(address seller, int256 delta) internal {
        SellerProfile storage profile = sellers[seller];
        if (delta > 0) {
            profile.reputationScore = _min(profile.reputationScore + uint256(delta), 10000);
        } else {
            uint256 deduction = uint256(-delta);
            profile.reputationScore = profile.reputationScore > deduction
                ? profile.reputationScore - deduction
                : 0;
        }
        emit SellerReputationUpdated(seller, profile.reputationScore);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _isValidToken(address token) internal view returns (bool) {
        return token == USDC || token == EURC || token == USYC;
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // ═══════════════════════════════════════
    //   VIEW FUNCTIONS (split to avoid stack-too-deep)
    // ═══════════════════════════════════════

    // --- Order views (split into 2) ---

    function getOrderCore(uint256 orderId) external view returns (
        uint256 id,
        address buyer,
        address seller,
        address paymentToken,
        address settlementToken,
        uint256 amount,
        uint8 status
    ) {
        Order storage o = orders[orderId];
        return (o.id, o.buyer, o.seller, o.paymentToken, o.settlementToken, o.amount, uint8(o.status));
    }

    function getOrderDetails(uint256 orderId) external view returns (
        uint256 settlementAmount,
        uint256 platformFee,
        uint256 createdAt,
        uint256 shippedAt,
        uint256 disputeDeadline
    ) {
        Order storage o = orders[orderId];
        return (o.settlementAmount, o.platformFee, o.createdAt, o.shippedAt, o.disputeDeadline);
    }

    // --- Seller view ---

    function getSeller(address seller) external view returns (
        bool registered,
        uint256 totalSales,
        uint256 totalOrders,
        uint256 disputeCount,
        uint256 reputationScore
    ) {
        SellerProfile storage s = sellers[seller];
        return (s.registered, s.totalSales, s.totalOrders, s.disputeCount, s.reputationScore);
    }

    // --- Dispute view ---

    function getDispute(uint256 orderId) external view returns (
        address opener,
        uint256 createdAt,
        bool resolved,
        address winner
    ) {
        Dispute storage d = disputes[orderId];
        return (d.opener, d.createdAt, d.resolved, d.winner);
    }

    // --- Listing views (split into 2) ---

    function getListingCore(uint256 listingId) external view returns (
        uint256 id,
        address seller,
        address paymentToken,
        uint256 price,
        bool active,
        uint256 createdAt,
        uint256 soldCount
    ) {
        Listing storage l = listings[listingId];
        return (l.id, l.seller, l.paymentToken, l.price, l.active, l.createdAt, l.soldCount);
    }

    function getListingMeta(uint256 listingId) external view returns (
        string memory title,
        string memory description,
        string memory imageURI,
        string memory category
    ) {
        return (listingTitle[listingId], listingDescription[listingId], listingImageURI[listingId], listingCategory[listingId]);
    }

    function getActiveListingCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 1; i < nextListingId; i++) {
            if (listings[i].active) count++;
        }
        return count;
    }

    function getSellerListings(address seller) external view returns (uint256[] memory) {
        return sellerListingIds[seller];
    }

    // ═══════════════════════════════════════
    //   ADMIN
    // ═══════════════════════════════════════

    function setAuthorizedAgent(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
    }

    function setPlatformFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10% fee");
        platformFeeBps = bps;
    }

    function setEscrowTimeout(uint256 seconds_) external onlyOwner {
        escrowTimeout = seconds_;
    }

    function setDisputeTimeout(uint256 seconds_) external onlyOwner {
        disputeTimeout = seconds_;
    }

    function kill() external onlyOwner {
        killed = true;
    }

    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner, amount), "Withdraw failed");
    }
}
