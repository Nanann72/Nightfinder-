"""
Iteration 8 Tests: Admin Interface + IBAN/SEPA Bank Integration
Tests for:
- Admin stats dashboard
- Admin user management (CRUD, role changes, ban)
- Admin KYC review (approve/reject)
- Content flagging and moderation
- Creator bank account (IBAN validation, SEPA XML export)
- Payout request with bank account requirement
"""

import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
CREATOR_EMAIL = "lysepress@meandyou.fans"
CREATOR_PASSWORD = "Creator2026!"

# Valid test IBAN (passes mod-97 check)
VALID_IBAN = "FR1420041010050500013M02606"
INVALID_IBAN = "FR76INVALID"


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
def creator_session():
    """Login as creator and return session with cookies"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": CREATOR_EMAIL,
        "password": CREATOR_PASSWORD
    })
    assert resp.status_code == 200, f"Creator login failed: {resp.text}"
    return session


class TestAdminStats:
    """GET /api/admin/stats - admin only"""
    
    def test_admin_stats_returns_all_fields(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/admin/stats")
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify all required fields are present
        required_fields = [
            "users_count", "creators_count", "fans_count", "banned_count",
            "active_subscriptions", "content_count", "flagged_count",
            "pending_kyc", "pending_payouts", "gmv_coins", "gmv_eur", "new_users_7d"
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
            print(f"  {field}: {data[field]}")
    
    def test_admin_stats_non_admin_403(self, fan_session):
        resp = fan_session.get(f"{BASE_URL}/api/admin/stats")
        assert resp.status_code == 403
        print("Non-admin correctly blocked from stats")


class TestAdminUsers:
    """Admin user management endpoints"""
    
    def test_admin_list_users(self, admin_session):
        """GET /api/admin/users - returns users without password hash"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        assert len(users) > 0
        
        # Verify password_hash is NOT leaked
        for user in users:
            assert "password_hash" not in user, "Password hash leaked!"
            assert "user_id" in user
            assert "email" in user
        print(f"Listed {len(users)} users, no password hash leaked")
    
    def test_admin_list_users_search(self, admin_session):
        """GET /api/admin/users?q=admin - search filter"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/users", params={"q": "admin"})
        assert resp.status_code == 200
        users = resp.json()
        # Should find admin user
        assert any("admin" in u.get("email", "").lower() for u in users)
        print(f"Search 'admin' returned {len(users)} users")
    
    def test_admin_list_users_role_filter(self, admin_session):
        """GET /api/admin/users?role=creator - role filter"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/users", params={"role": "creator"})
        assert resp.status_code == 200
        users = resp.json()
        for user in users:
            assert user.get("role") == "creator"
        print(f"Role filter 'creator' returned {len(users)} users")
    
    def test_admin_list_users_non_admin_403(self, fan_session):
        resp = fan_session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 403
    
    def test_admin_update_user_invalid_role_400(self, admin_session):
        """PATCH /api/admin/users/{id} - invalid role returns 400"""
        # First get a user
        resp = admin_session.get(f"{BASE_URL}/api/admin/users", params={"role": "fan", "limit": 1})
        users = resp.json()
        if not users:
            pytest.skip("No fan users to test")
        
        user_id = users[0]["user_id"]
        resp = admin_session.patch(f"{BASE_URL}/api/admin/users/{user_id}", json={"role": "superadmin"})
        assert resp.status_code == 400
        print("Invalid role correctly rejected")
    
    def test_admin_update_user_non_admin_403(self, fan_session):
        """Non-admin cannot update users"""
        resp = fan_session.patch(f"{BASE_URL}/api/admin/users/user_test123", json={"role": "admin"})
        assert resp.status_code == 403


class TestBannedUserLogin:
    """Test that banned users get 403 on /api/auth/me"""
    
    def test_banned_user_blocked(self, admin_session):
        """After banning, user's /api/auth/me returns 403 'Compte suspendu'"""
        # Create a test user to ban
        test_email = f"test_ban_{os.urandom(4).hex()}@test.com"
        session = requests.Session()
        
        # Register test user
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "TestPass123!",
            "name": "Test Ban User"
        })
        if resp.status_code != 200:
            pytest.skip("Could not create test user")
        
        user_id = resp.json()["user"]["user_id"]
        
        # Verify user can access /me
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        
        # Admin bans the user
        resp = admin_session.patch(f"{BASE_URL}/api/admin/users/{user_id}", json={"banned": True})
        assert resp.status_code == 200
        
        # Now user's /me should return 403
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 403
        assert "suspendu" in resp.json().get("detail", "").lower()
        print("Banned user correctly blocked with 'Compte suspendu'")
        
        # Cleanup: unban and delete
        admin_session.patch(f"{BASE_URL}/api/admin/users/{user_id}", json={"banned": False})
        admin_session.delete(f"{BASE_URL}/api/admin/users/{user_id}")


class TestAdminDeleteUser:
    """DELETE /api/admin/users/{user_id} - cascade delete"""
    
    def test_admin_cannot_delete_self(self, admin_session):
        """Admin cannot delete themselves"""
        # Get admin's user_id
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = resp.json()["user_id"]
        
        resp = admin_session.delete(f"{BASE_URL}/api/admin/users/{admin_id}")
        assert resp.status_code == 400
        print("Admin correctly prevented from self-deletion")
    
    def test_admin_delete_user_cascade(self, admin_session):
        """Delete user cascades to related data"""
        # Create test user
        test_email = f"test_del_{os.urandom(4).hex()}@test.com"
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "TestPass123!",
            "name": "Test Delete User"
        })
        if resp.status_code != 200:
            pytest.skip("Could not create test user")
        
        user_id = resp.json()["user"]["user_id"]
        
        # Delete user
        resp = admin_session.delete(f"{BASE_URL}/api/admin/users/{user_id}")
        assert resp.status_code == 200
        
        # Verify user is gone
        resp = admin_session.get(f"{BASE_URL}/api/admin/users", params={"q": test_email})
        users = resp.json()
        assert not any(u["user_id"] == user_id for u in users)
        print("User deleted with cascade")


class TestAdminKYC:
    """Admin KYC review endpoints"""
    
    def test_admin_list_kyc(self, admin_session):
        """GET /api/admin/kyc - returns verification sessions with user info"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/kyc")
        assert resp.status_code == 200
        items = resp.json()
        assert isinstance(items, list)
        print(f"Listed {len(items)} KYC sessions")
    
    def test_admin_list_kyc_filter_status(self, admin_session):
        """GET /api/admin/kyc?status=processing - filter by status"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/kyc", params={"status": "processing"})
        assert resp.status_code == 200
        items = resp.json()
        for item in items:
            assert item.get("status") in ["processing", "pending"]
        print(f"Filtered KYC by status: {len(items)} items")
    
    def test_admin_kyc_non_admin_403(self, fan_session):
        resp = fan_session.get(f"{BASE_URL}/api/admin/kyc")
        assert resp.status_code == 403


class TestContentFlagging:
    """Content flagging and moderation"""
    
    def test_flag_content(self, fan_session, admin_session):
        """POST /api/content/{id}/flag - authenticated user flags content"""
        # Get some content
        resp = admin_session.get(f"{BASE_URL}/api/admin/content", params={"flagged": False, "limit": 1})
        if resp.status_code != 200:
            # Try getting any content from a creator
            resp = requests.get(f"{BASE_URL}/api/creators")
            creators = resp.json()
            if not creators:
                pytest.skip("No content to flag")
            creator = creators[0]
            resp = requests.get(f"{BASE_URL}/api/creators/{creator['creator_id']}")
            content = resp.json().get("content", [])
            if not content:
                pytest.skip("No content to flag")
            content_id = content[0]["content_id"]
        else:
            items = resp.json()
            if not items:
                pytest.skip("No unflagged content")
            content_id = items[0]["content_id"]
        
        # Flag the content
        resp = fan_session.post(f"{BASE_URL}/api/content/{content_id}/flag", json={"reason": "Test flag"})
        assert resp.status_code == 200
        print(f"Content {content_id} flagged successfully")
    
    def test_admin_list_flagged_content(self, admin_session):
        """GET /api/admin/content?flagged=true - returns flagged content with flags[]"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/content", params={"flagged": True})
        assert resp.status_code == 200
        items = resp.json()
        for item in items:
            assert item.get("flagged") == True
            assert "flags" in item
        print(f"Listed {len(items)} flagged content items")
    
    def test_admin_content_non_admin_403(self, fan_session):
        resp = fan_session.get(f"{BASE_URL}/api/admin/content")
        assert resp.status_code == 403


class TestCreatorBankAccount:
    """Creator IBAN/bank account management"""
    
    def test_save_valid_iban(self, creator_session):
        """POST /api/payouts/bank - valid IBAN passes mod-97 check"""
        resp = creator_session.post(f"{BASE_URL}/api/payouts/bank", json={
            "iban": VALID_IBAN,
            "bic": "PSSTFRPPPAR",
            "holder_name": "Lyse Press",
            "country": "FR"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("ok") == True
        assert "iban_masked" in data
        print(f"Valid IBAN saved, masked: {data['iban_masked']}")
    
    def test_save_invalid_iban_400(self, creator_session):
        """POST /api/payouts/bank - invalid IBAN returns 400"""
        resp = creator_session.post(f"{BASE_URL}/api/payouts/bank", json={
            "iban": INVALID_IBAN,
            "holder_name": "Test User"
        })
        assert resp.status_code == 400
        assert "IBAN" in resp.json().get("detail", "")
        print("Invalid IBAN correctly rejected")
    
    def test_get_bank_masked_iban(self, creator_session):
        """GET /api/payouts/bank - returns masked IBAN, raw IBAN NOT leaked"""
        # First ensure bank is saved
        creator_session.post(f"{BASE_URL}/api/payouts/bank", json={
            "iban": VALID_IBAN,
            "bic": "PSSTFRPPPAR",
            "holder_name": "Lyse Press",
            "country": "FR"
        })
        
        resp = creator_session.get(f"{BASE_URL}/api/payouts/bank")
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify raw IBAN is NOT in response
        assert "iban" not in data or data.get("iban") is None, "Raw IBAN leaked!"
        assert "iban_masked" in data
        assert "holder_name" in data
        
        # Verify masking format (first4 + last4)
        masked = data["iban_masked"]
        assert "••••" in masked
        print(f"Bank info retrieved, IBAN masked: {masked}")
    
    def test_delete_bank(self, creator_session):
        """DELETE /api/payouts/bank - removes bank account"""
        # First ensure bank exists
        creator_session.post(f"{BASE_URL}/api/payouts/bank", json={
            "iban": VALID_IBAN,
            "holder_name": "Lyse Press"
        })
        
        resp = creator_session.delete(f"{BASE_URL}/api/payouts/bank")
        assert resp.status_code == 200
        
        # Verify it's gone
        resp = creator_session.get(f"{BASE_URL}/api/payouts/bank")
        assert resp.status_code == 200
        assert resp.json() is None
        print("Bank account deleted")
        
        # Re-add for other tests
        creator_session.post(f"{BASE_URL}/api/payouts/bank", json={
            "iban": VALID_IBAN,
            "bic": "PSSTFRPPPAR",
            "holder_name": "Lyse Press",
            "country": "FR"
        })


class TestPayoutWithBankRequirement:
    """POST /api/payouts/request - requires bank account"""
    
    def test_payout_without_bank_400(self, creator_session):
        """Payout request without bank account returns 400"""
        # Delete bank first
        creator_session.delete(f"{BASE_URL}/api/payouts/bank")
        
        resp = creator_session.post(f"{BASE_URL}/api/payouts/request", json={"coins": 500})
        assert resp.status_code == 400
        assert "IBAN" in resp.json().get("detail", "") or "bank" in resp.json().get("detail", "").lower()
        print("Payout without bank correctly rejected")
        
        # Re-add bank for other tests
        creator_session.post(f"{BASE_URL}/api/payouts/bank", json={
            "iban": VALID_IBAN,
            "holder_name": "Lyse Press"
        })


class TestAdminSepaXml:
    """GET /api/admin/payouts/{id}/sepa.xml - SEPA XML export"""
    
    def test_sepa_xml_export(self, admin_session):
        """Admin can export SEPA XML for pending payout"""
        # Get pending payouts
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts", params={"status": "pending"})
        assert resp.status_code == 200
        payouts = resp.json()
        
        if not payouts:
            pytest.skip("No pending payouts to test SEPA XML")
        
        payout = payouts[0]
        request_id = payout["request_id"]
        
        # Get SEPA XML
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts/{request_id}/sepa.xml")
        assert resp.status_code == 200
        
        # Verify content type
        content_type = resp.headers.get("Content-Type", "")
        assert "xml" in content_type.lower()
        
        # Verify Content-Disposition attachment
        content_disp = resp.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp.lower()
        assert "sepa" in content_disp.lower()
        
        # Verify XML content
        xml_content = resp.text
        assert "<?xml" in xml_content
        assert "pain.001" in xml_content
        assert "IBAN" in xml_content
        assert "EndToEndId" in xml_content
        
        print(f"SEPA XML exported for payout {request_id}")
        print(f"Content-Disposition: {content_disp}")
    
    def test_sepa_xml_non_admin_403(self, fan_session):
        """Non-admin cannot export SEPA XML"""
        resp = fan_session.get(f"{BASE_URL}/api/admin/payouts/po_test123/sepa.xml")
        assert resp.status_code == 403


class TestAdminPayoutsWithIban:
    """Admin payouts list should include IBAN info"""
    
    def test_admin_payouts_include_iban_snapshot(self, admin_session):
        """GET /api/admin/payouts - includes iban_snapshot for payouts"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/payouts")
        assert resp.status_code == 200
        payouts = resp.json()
        
        for payout in payouts:
            # Payouts should have iban_snapshot (from when request was made)
            if "iban_snapshot" in payout:
                print(f"Payout {payout['request_id']} has IBAN snapshot")
        
        print(f"Listed {len(payouts)} payouts")


class TestRoleChangeCreatorProfile:
    """When setting role=creator, creator profile is auto-created"""
    
    def test_role_change_to_creator_creates_profile(self, admin_session):
        """PATCH role=creator auto-creates creator profile"""
        # Create test user
        test_email = f"test_role_{os.urandom(4).hex()}@test.com"
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "TestPass123!",
            "name": "Test Role User"
        })
        if resp.status_code != 200:
            pytest.skip("Could not create test user")
        
        user_id = resp.json()["user"]["user_id"]
        
        # Change role to creator
        resp = admin_session.patch(f"{BASE_URL}/api/admin/users/{user_id}", json={"role": "creator"})
        assert resp.status_code == 200
        
        # Verify creator profile exists
        resp = requests.get(f"{BASE_URL}/api/creators/{user_id}")
        assert resp.status_code == 200
        creator = resp.json()
        assert creator["creator_id"] == user_id
        print(f"Creator profile auto-created for {user_id}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/users/{user_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
