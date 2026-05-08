"""
Iteration 7 Tests: Saved Cards, Auto-Reload, Admin Payouts, Subscriptions Cancel
Tests for:
- POST /api/wallet/cards - add simulated card
- GET /api/wallet/cards - list user's cards
- DELETE /api/wallet/cards/{card_id} - remove card
- POST /api/wallet/cards/{card_id}/default - set default card
- GET /api/wallet/auto-reload - get auto-reload settings
- POST /api/wallet/auto-reload - configure auto-reload
- GET /api/admin/payouts - admin list payout requests
- POST /api/admin/payouts/{id}/approve - admin approve payout
- POST /api/admin/payouts/{id}/reject - admin reject payout (refunds coins)
- DELETE /api/subscriptions/{creator_id} - cancel subscription
- GET /api/subscriptions - regression test
- POST /api/subscriptions/{creator_id}/auto-renew - regression test
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
CREATOR_EMAIL = "lysepress@meandyou.fans"
CREATOR_PASSWORD = "Creator2026!"


@pytest.fixture(scope="module")
def fan_session():
    """Login as fan and return session with cookies"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    assert resp.status_code == 200, f"Fan login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def admin_session():
    """Login as admin and return session with cookies"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def creator_session():
    """Login as creator and return session with cookies"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": CREATOR_EMAIL,
        "password": CREATOR_PASSWORD
    })
    assert resp.status_code == 200, f"Creator login failed: {resp.text}"
    return session


class TestSavedCards:
    """Tests for /api/wallet/cards endpoints"""
    
    def test_list_cards_empty_initially(self, fan_session):
        """GET /api/wallet/cards returns list (may be empty or have cards from prior tests)"""
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Current cards count: {len(data)}")
    
    def test_add_card_valid(self, fan_session):
        """POST /api/wallet/cards with valid data creates card"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "4242",
            "exp_month": 12,
            "exp_year": 2028,
            "holder_name": "Test Fan"
        })
        assert resp.status_code == 200, f"Add card failed: {resp.text}"
        data = resp.json()
        assert "card_id" in data
        assert data["last4"] == "4242"
        assert data["brand"] == "Visa"
        assert data["exp_month"] == 12
        assert data["exp_year"] == 2028
        assert data["is_simulated"] == True
        print(f"Created card: {data['card_id']}")
    
    def test_add_card_invalid_last4_not_4_digits(self, fan_session):
        """POST /api/wallet/cards with invalid last4 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "123",  # Only 3 digits
            "exp_month": 12,
            "exp_year": 2028
        })
        assert resp.status_code == 400
        assert "last4" in resp.json().get("detail", "").lower()
    
    def test_add_card_invalid_last4_non_digits(self, fan_session):
        """POST /api/wallet/cards with non-digit last4 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "abcd",
            "exp_month": 12,
            "exp_year": 2028
        })
        assert resp.status_code == 400
    
    def test_add_card_invalid_exp_month_0(self, fan_session):
        """POST /api/wallet/cards with exp_month=0 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "1234",
            "exp_month": 0,
            "exp_year": 2028
        })
        assert resp.status_code == 400
        assert "mois" in resp.json().get("detail", "").lower()
    
    def test_add_card_invalid_exp_month_13(self, fan_session):
        """POST /api/wallet/cards with exp_month=13 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "1234",
            "exp_month": 13,
            "exp_year": 2028
        })
        assert resp.status_code == 400
    
    def test_add_card_invalid_exp_year_too_old(self, fan_session):
        """POST /api/wallet/cards with exp_year < 2026 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "1234",
            "exp_month": 12,
            "exp_year": 2025
        })
        assert resp.status_code == 400
        assert "année" in resp.json().get("detail", "").lower()
    
    def test_add_card_invalid_exp_year_too_far(self, fan_session):
        """POST /api/wallet/cards with exp_year > 2045 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "1234",
            "exp_month": 12,
            "exp_year": 2050
        })
        assert resp.status_code == 400
    
    def test_first_card_is_default(self, fan_session):
        """First card added should be default"""
        # Clean up existing cards first
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        cards = resp.json()
        for c in cards:
            fan_session.delete(f"{BASE_URL}/api/wallet/cards/{c['card_id']}")
        
        # Add first card
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Mastercard",
            "last4": "5555",
            "exp_month": 6,
            "exp_year": 2030,
            "holder_name": "First Card"
        })
        assert resp.status_code == 200
        first_card = resp.json()
        assert first_card["is_default"] == True
        print(f"First card {first_card['card_id']} is_default: {first_card['is_default']}")
    
    def test_second_card_not_default(self, fan_session):
        """Second card added should NOT be default"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Amex",
            "last4": "3782",
            "exp_month": 3,
            "exp_year": 2029,
            "holder_name": "Second Card"
        })
        assert resp.status_code == 200
        second_card = resp.json()
        assert second_card["is_default"] == False
        print(f"Second card {second_card['card_id']} is_default: {second_card['is_default']}")
    
    def test_set_default_card(self, fan_session):
        """POST /api/wallet/cards/{card_id}/default sets card as default"""
        # Get cards
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        cards = resp.json()
        assert len(cards) >= 2, "Need at least 2 cards for this test"
        
        # Find non-default card
        non_default = next((c for c in cards if not c["is_default"]), None)
        assert non_default, "No non-default card found"
        
        # Set as default
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards/{non_default['card_id']}/default")
        assert resp.status_code == 200
        
        # Verify
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        cards = resp.json()
        new_default = next((c for c in cards if c["card_id"] == non_default["card_id"]), None)
        assert new_default["is_default"] == True
        print(f"Card {non_default['card_id']} is now default")
    
    def test_delete_card(self, fan_session):
        """DELETE /api/wallet/cards/{card_id} removes card"""
        # Add a card to delete
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "9999",
            "exp_month": 1,
            "exp_year": 2027
        })
        card_id = resp.json()["card_id"]
        
        # Delete it
        resp = fan_session.delete(f"{BASE_URL}/api/wallet/cards/{card_id}")
        assert resp.status_code == 200
        
        # Verify gone
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        cards = resp.json()
        assert not any(c["card_id"] == card_id for c in cards)
        print(f"Card {card_id} deleted successfully")
    
    def test_delete_default_card_promotes_next(self, fan_session):
        """Deleting default card should make another card default"""
        # Ensure we have at least 2 cards
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        cards = resp.json()
        if len(cards) < 2:
            fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
                "brand": "Visa", "last4": "1111", "exp_month": 1, "exp_year": 2030
            })
            fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
                "brand": "Visa", "last4": "2222", "exp_month": 2, "exp_year": 2030
            })
            resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
            cards = resp.json()
        
        # Find and delete default
        default_card = next((c for c in cards if c["is_default"]), None)
        if default_card:
            fan_session.delete(f"{BASE_URL}/api/wallet/cards/{default_card['card_id']}")
            
            # Check remaining cards
            resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
            remaining = resp.json()
            if remaining:
                has_default = any(c["is_default"] for c in remaining)
                assert has_default, "No card was promoted to default after deleting default card"
                print("Another card was promoted to default")
    
    def test_delete_nonexistent_card_404(self, fan_session):
        """DELETE /api/wallet/cards/{invalid_id} returns 404"""
        resp = fan_session.delete(f"{BASE_URL}/api/wallet/cards/pm_nonexistent_12345")
        assert resp.status_code == 404
    
    def test_cards_unauthenticated_401(self):
        """Unauthenticated requests to cards endpoints return 401"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/wallet/cards")
        assert resp.status_code == 401


class TestAutoReload:
    """Tests for /api/wallet/auto-reload endpoints"""
    
    def test_get_auto_reload_default_settings(self, fan_session):
        """GET /api/wallet/auto-reload returns default settings"""
        resp = fan_session.get(f"{BASE_URL}/api/wallet/auto-reload")
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "threshold" in data
        assert "pack_id" in data
        # Default values
        if not data.get("updated_at"):  # If never configured
            assert data["threshold"] == 50
            assert data["pack_id"] == "popular"
        print(f"Auto-reload settings: enabled={data['enabled']}, threshold={data['threshold']}, pack={data['pack_id']}")
    
    def test_set_auto_reload_without_card_fails(self, fan_session):
        """POST /api/wallet/auto-reload with enabled=true but no default card returns 400"""
        # First ensure no cards
        resp = fan_session.get(f"{BASE_URL}/api/wallet/cards")
        cards = resp.json()
        for c in cards:
            fan_session.delete(f"{BASE_URL}/api/wallet/cards/{c['card_id']}")
        
        # Try to enable auto-reload
        resp = fan_session.post(f"{BASE_URL}/api/wallet/auto-reload", json={
            "enabled": True,
            "threshold": 100,
            "pack_id": "popular"
        })
        assert resp.status_code == 400
        assert "carte" in resp.json().get("detail", "").lower()
        print("Correctly rejected: no default card")
    
    def test_set_auto_reload_invalid_pack_fails(self, fan_session):
        """POST /api/wallet/auto-reload with invalid pack_id returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/auto-reload", json={
            "enabled": False,
            "threshold": 100,
            "pack_id": "invalid_pack"
        })
        assert resp.status_code == 400
        assert "pack" in resp.json().get("detail", "").lower()
    
    def test_set_auto_reload_threshold_too_low(self, fan_session):
        """POST /api/wallet/auto-reload with threshold < 10 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/auto-reload", json={
            "enabled": False,
            "threshold": 5,
            "pack_id": "popular"
        })
        assert resp.status_code == 400
        assert "seuil" in resp.json().get("detail", "").lower()
    
    def test_set_auto_reload_threshold_too_high(self, fan_session):
        """POST /api/wallet/auto-reload with threshold > 5000 returns 400"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/auto-reload", json={
            "enabled": False,
            "threshold": 6000,
            "pack_id": "popular"
        })
        assert resp.status_code == 400
    
    def test_set_auto_reload_disabled_works(self, fan_session):
        """POST /api/wallet/auto-reload with enabled=false works without card"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/auto-reload", json={
            "enabled": False,
            "threshold": 100,
            "pack_id": "starter"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] == False
        assert data["threshold"] == 100
        assert data["pack_id"] == "starter"
        print("Auto-reload disabled successfully")
    
    def test_set_auto_reload_enabled_with_card(self, fan_session):
        """POST /api/wallet/auto-reload with enabled=true and default card works"""
        # Add a card first
        fan_session.post(f"{BASE_URL}/api/wallet/cards", json={
            "brand": "Visa",
            "last4": "4242",
            "exp_month": 12,
            "exp_year": 2030
        })
        
        # Enable auto-reload
        resp = fan_session.post(f"{BASE_URL}/api/wallet/auto-reload", json={
            "enabled": True,
            "threshold": 50,
            "pack_id": "popular"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] == True
        print("Auto-reload enabled successfully")
    
    def test_auto_reload_unauthenticated_401(self):
        """Unauthenticated requests to auto-reload return 401"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/wallet/auto-reload")
        assert resp.status_code == 401


class TestAdminPayouts:
    """Tests for /api/admin/payouts endpoints"""
    
    def test_admin_list_payouts(self, admin_session):
        """GET /api/admin/payouts returns list of payout requests"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Admin sees {len(data)} payout requests")
        if data:
            # Check structure
            p = data[0]
            assert "request_id" in p
            assert "creator_id" in p
            assert "coins" in p
            assert "eur_value" in p
            assert "status" in p
            assert "creator" in p or p.get("creator") is None
            assert "user" in p or p.get("user") is None
    
    def test_admin_list_payouts_filter_pending(self, admin_session):
        """GET /api/admin/payouts?status=pending filters correctly"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts", params={"status": "pending"})
        assert resp.status_code == 200
        data = resp.json()
        for p in data:
            assert p["status"] == "pending"
        print(f"Found {len(data)} pending payouts")
    
    def test_admin_list_payouts_filter_paid(self, admin_session):
        """GET /api/admin/payouts?status=paid filters correctly"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts", params={"status": "paid"})
        assert resp.status_code == 200
        data = resp.json()
        for p in data:
            assert p["status"] == "paid"
        print(f"Found {len(data)} paid payouts")
    
    def test_admin_list_payouts_filter_rejected(self, admin_session):
        """GET /api/admin/payouts?status=rejected filters correctly"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts", params={"status": "rejected"})
        assert resp.status_code == 200
        data = resp.json()
        for p in data:
            assert p["status"] == "rejected"
        print(f"Found {len(data)} rejected payouts")
    
    def test_non_admin_cannot_list_payouts(self, fan_session):
        """GET /api/admin/payouts as non-admin returns 403"""
        resp = fan_session.get(f"{BASE_URL}/api/admin/payouts")
        assert resp.status_code == 403
        print("Non-admin correctly rejected from admin payouts")
    
    def test_admin_approve_nonexistent_payout_404(self, admin_session):
        """POST /api/admin/payouts/{invalid}/approve returns 404"""
        resp = admin_session.post(f"{BASE_URL}/api/admin/payouts/po_nonexistent/approve")
        assert resp.status_code == 404
    
    def test_admin_reject_nonexistent_payout_404(self, admin_session):
        """POST /api/admin/payouts/{invalid}/reject returns 404"""
        resp = admin_session.post(f"{BASE_URL}/api/admin/payouts/po_nonexistent/reject")
        assert resp.status_code == 404
    
    def test_non_admin_cannot_approve(self, fan_session):
        """POST /api/admin/payouts/{id}/approve as non-admin returns 403"""
        resp = fan_session.post(f"{BASE_URL}/api/admin/payouts/po_any/approve")
        assert resp.status_code == 403
    
    def test_non_admin_cannot_reject(self, fan_session):
        """POST /api/admin/payouts/{id}/reject as non-admin returns 403"""
        resp = fan_session.post(f"{BASE_URL}/api/admin/payouts/po_any/reject")
        assert resp.status_code == 403


class TestAdminPayoutApproveReject:
    """Tests for approve/reject payout flow - requires creating a payout first"""
    
    def test_create_and_approve_payout(self, creator_session, admin_session):
        """Full flow: creator requests payout, admin approves"""
        # Check creator wallet balance
        resp = creator_session.get(f"{BASE_URL}/api/wallet")
        wallet_before = resp.json()
        print(f"Creator wallet before: {wallet_before['coin_balance']} coins")
        
        if wallet_before["coin_balance"] < 500:
            pytest.skip("Creator has insufficient balance for payout test")
        
        # Request payout
        resp = creator_session.post(f"{BASE_URL}/api/payouts/request", json={"coins": 500})
        if resp.status_code == 402:
            pytest.skip("Creator has insufficient balance")
        assert resp.status_code == 200, f"Payout request failed: {resp.text}"
        payout = resp.json()
        request_id = payout["request_id"]
        print(f"Created payout request: {request_id}")
        
        # Admin approves
        resp = admin_session.post(f"{BASE_URL}/api/admin/payouts/{request_id}/approve")
        assert resp.status_code == 200
        
        # Verify status changed
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts")
        payouts = resp.json()
        approved = next((p for p in payouts if p["request_id"] == request_id), None)
        assert approved["status"] == "paid"
        assert "paid_at" in approved
        print(f"Payout {request_id} approved successfully")
    
    def test_create_and_reject_payout_refunds_coins(self, creator_session, admin_session):
        """Full flow: creator requests payout, admin rejects, coins refunded"""
        # Check creator wallet balance
        resp = creator_session.get(f"{BASE_URL}/api/wallet")
        wallet_before = resp.json()
        balance_before = wallet_before["coin_balance"]
        print(f"Creator wallet before: {balance_before} coins")
        
        if balance_before < 500:
            pytest.skip("Creator has insufficient balance for payout test")
        
        # Request payout
        resp = creator_session.post(f"{BASE_URL}/api/payouts/request", json={"coins": 500})
        if resp.status_code == 402:
            pytest.skip("Creator has insufficient balance")
        assert resp.status_code == 200
        payout = resp.json()
        request_id = payout["request_id"]
        
        # Check balance after request (should be debited)
        resp = creator_session.get(f"{BASE_URL}/api/wallet")
        balance_after_request = resp.json()["coin_balance"]
        assert balance_after_request == balance_before - 500
        print(f"Balance after request: {balance_after_request} (debited 500)")
        
        # Admin rejects
        resp = admin_session.post(f"{BASE_URL}/api/admin/payouts/{request_id}/reject")
        assert resp.status_code == 200
        
        # Verify coins refunded
        resp = creator_session.get(f"{BASE_URL}/api/wallet")
        balance_after_reject = resp.json()["coin_balance"]
        assert balance_after_reject == balance_before, f"Expected {balance_before}, got {balance_after_reject}"
        print(f"Balance after reject: {balance_after_reject} (refunded 500)")
        
        # Verify status
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts")
        payouts = resp.json()
        rejected = next((p for p in payouts if p["request_id"] == request_id), None)
        assert rejected["status"] == "rejected"
        print(f"Payout {request_id} rejected and coins refunded")
    
    def test_approve_already_processed_returns_400(self, admin_session):
        """POST /api/admin/payouts/{id}/approve on non-pending returns 400"""
        # Find a non-pending payout
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts")
        payouts = resp.json()
        non_pending = next((p for p in payouts if p["status"] != "pending"), None)
        
        if not non_pending:
            pytest.skip("No non-pending payouts to test")
        
        resp = admin_session.post(f"{BASE_URL}/api/admin/payouts/{non_pending['request_id']}/approve")
        assert resp.status_code == 400
        assert "traité" in resp.json().get("detail", "").lower()
        print(f"Correctly rejected re-approval of {non_pending['request_id']}")


class TestSubscriptionCancel:
    """Tests for DELETE /api/subscriptions/{creator_id}"""
    
    def test_cancel_subscription_sets_auto_renew_false(self, fan_session):
        """DELETE /api/subscriptions/{creator_id} sets auto_renew=false"""
        # Get current subscriptions
        resp = fan_session.get(f"{BASE_URL}/api/subscriptions")
        subs = resp.json()
        
        # Find an active subscription with auto_renew=true
        active_sub = next((s for s in subs if s["status"] == "active" and s.get("auto_renew")), None)
        
        if not active_sub:
            pytest.skip("No active subscription with auto_renew=true to test cancel")
        
        creator_id = active_sub["creator_id"]
        print(f"Cancelling subscription to {creator_id}")
        
        # Cancel
        resp = fan_session.delete(f"{BASE_URL}/api/subscriptions/{creator_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] == True
        
        # Verify auto_renew is now false
        resp = fan_session.get(f"{BASE_URL}/api/subscriptions")
        subs = resp.json()
        cancelled = next((s for s in subs if s["creator_id"] == creator_id), None)
        assert cancelled["auto_renew"] == False
        assert "cancelled_at" in cancelled or cancelled.get("expire_at_end") == True
        print(f"Subscription to {creator_id} cancelled, auto_renew=false")
    
    def test_cancel_nonexistent_subscription_404(self, fan_session):
        """DELETE /api/subscriptions/{invalid_creator} returns 404"""
        resp = fan_session.delete(f"{BASE_URL}/api/subscriptions/user_nonexistent_12345")
        assert resp.status_code == 404
    
    def test_cancel_unauthenticated_401(self):
        """DELETE /api/subscriptions/{id} unauthenticated returns 401"""
        session = requests.Session()
        resp = session.delete(f"{BASE_URL}/api/subscriptions/user_any")
        assert resp.status_code == 401


class TestSubscriptionsRegression:
    """Regression tests for existing subscription endpoints"""
    
    def test_get_subscriptions_returns_list_with_creator_info(self, fan_session):
        """GET /api/subscriptions returns list with creator info and auto_renew flag"""
        resp = fan_session.get(f"{BASE_URL}/api/subscriptions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Fan has {len(data)} subscriptions")
        
        if data:
            sub = data[0]
            assert "creator_id" in sub
            assert "auto_renew" in sub
            assert "creator" in sub
            if sub["creator"]:
                assert "display_name" in sub["creator"]
    
    def test_toggle_auto_renew_works(self, fan_session):
        """POST /api/subscriptions/{creator_id}/auto-renew toggles the flag"""
        # Get subscriptions
        resp = fan_session.get(f"{BASE_URL}/api/subscriptions")
        subs = resp.json()
        
        if not subs:
            pytest.skip("No subscriptions to test toggle")
        
        sub = subs[0]
        creator_id = sub["creator_id"]
        original_value = sub["auto_renew"]
        
        # Toggle
        resp = fan_session.post(f"{BASE_URL}/api/subscriptions/{creator_id}/auto-renew")
        assert resp.status_code == 200
        data = resp.json()
        assert data["auto_renew"] == (not original_value)
        
        # Toggle back
        resp = fan_session.post(f"{BASE_URL}/api/subscriptions/{creator_id}/auto-renew")
        assert resp.status_code == 200
        data = resp.json()
        assert data["auto_renew"] == original_value
        print(f"Toggle auto_renew for {creator_id} works correctly")
    
    def test_toggle_nonexistent_subscription_404(self, fan_session):
        """POST /api/subscriptions/{invalid}/auto-renew returns 404"""
        resp = fan_session.post(f"{BASE_URL}/api/subscriptions/user_nonexistent/auto-renew")
        assert resp.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
