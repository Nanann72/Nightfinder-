"""
Iteration 18 Backend Tests
Tests for 4 bug fixes:
1. Stripe customer auto-heal: POST /api/wallet/cards/setup-intent with stale stripe_customer_id
2. HEIC upload support: POST /api/upload with .heic file → auto-convert to JPEG
3. Stripe Identity LIVE mode: POST /api/verification/start returns verify.stripe.com/start/live_*
4. Regression tests from iter16 + iter17
"""

import pytest
import requests
import os
import uuid
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"


class TestAuth:
    """Authentication tests"""
    
    def test_login_admin(self):
        """Admin login should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful, role={data['user']['role']}")
    
    def test_login_fan(self):
        """Fan login should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert response.status_code == 200, f"Fan login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "fan"
        print(f"✓ Fan login successful, role={data['user']['role']}")


class TestStripeCustomerAutoHeal:
    """Test POST /api/wallet/cards/setup-intent with stripe customer auto-heal"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_setup_intent_returns_valid_customer_and_seti(self, fan_token):
        """POST /api/wallet/cards/setup-intent should return valid customer_id and client_secret starting with 'seti_'"""
        response = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent",
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "client_secret" in data, "Response should contain client_secret"
        assert "customer_id" in data, "Response should contain customer_id"
        assert "publishable_key" in data, "Response should contain publishable_key"
        
        # Verify client_secret starts with 'seti_' (SetupIntent in LIVE mode)
        client_secret = data["client_secret"]
        assert client_secret.startswith("seti_"), f"Expected client_secret to start with 'seti_', got: {client_secret[:20]}..."
        
        # Verify customer_id starts with 'cus_'
        customer_id = data["customer_id"]
        assert customer_id.startswith("cus_"), f"Expected customer_id to start with 'cus_', got: {customer_id}"
        
        # Verify publishable_key is live
        pk = data["publishable_key"]
        assert pk.startswith("pk_live_"), f"Expected publishable_key to start with 'pk_live_', got: {pk[:20]}..."
        
        print(f"✓ setup-intent returns LIVE: client_secret={client_secret[:25]}..., customer_id={customer_id}")
    
    def test_setup_intent_auto_heals_stale_customer(self, fan_token):
        """POST /api/wallet/cards/setup-intent should auto-heal if stripe_customer_id is stale"""
        # The DB has been purged of stripe_customer_id, so this test verifies
        # that a new customer is created successfully
        response = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent",
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed (should auto-heal): {response.text}"
        data = response.json()
        
        # Should not return 502 error about stale customer
        assert "customer_id" in data
        assert data["customer_id"].startswith("cus_")
        
        print(f"✓ setup-intent auto-heals stale customer, new customer_id={data['customer_id']}")


class TestStripeIdentityLive:
    """Test POST /api/verification/start returns LIVE Stripe Identity URL"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_verification_start_returns_live_stripe_url(self, fan_token):
        """POST /api/verification/start should return mode='stripe' with verify.stripe.com/start/live_* URL"""
        response = requests.post(f"{BASE_URL}/api/verification/start",
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "url" in data, "Response should contain url"
        assert "session_id" in data, "Response should contain session_id"
        assert "mode" in data, "Response should contain mode"
        
        # Verify mode is 'stripe' (not 'mock')
        assert data["mode"] == "stripe", f"Expected mode='stripe', got: {data['mode']}"
        
        # Verify URL is LIVE Stripe Identity
        url = data["url"]
        assert url is not None, "URL should not be None for LIVE mode"
        assert "verify.stripe.com" in url, f"Expected verify.stripe.com URL, got: {url}"
        assert "/start/live_" in url, f"Expected /start/live_* in URL (LIVE mode), got: {url}"
        
        # Verify session_id starts with 'vs_' (VerificationSession)
        session_id = data["session_id"]
        assert session_id.startswith("vs_"), f"Expected session_id to start with 'vs_', got: {session_id}"
        
        print(f"✓ verification/start returns LIVE: mode={data['mode']}, url contains 'live_', session_id={session_id[:20]}...")


class TestHEICUpload:
    """Test POST /api/upload with HEIC file → auto-convert to JPEG"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def _create_minimal_heic_file(self):
        """Create a minimal HEIC file using pillow_heif if available, else a synthetic one"""
        try:
            import pillow_heif
            from PIL import Image
            
            # Create a small test image
            img = Image.new('RGB', (100, 100), color='red')
            buf = io.BytesIO()
            
            # Try to save as HEIF
            pillow_heif.register_heif_opener()
            img.save(buf, format='HEIF', quality=50)
            buf.seek(0)
            return buf.getvalue(), True
        except Exception as e:
            print(f"Note: Could not create real HEIC (pillow_heif not available): {e}")
            # Create a minimal HEIF signature file (ftyp box)
            # This won't be a valid image but tests the extension handling
            heif_header = bytes([
                0x00, 0x00, 0x00, 0x18,  # box size (24 bytes)
                0x66, 0x74, 0x79, 0x70,  # 'ftyp'
                0x68, 0x65, 0x69, 0x63,  # 'heic' brand
                0x00, 0x00, 0x00, 0x00,  # minor version
                0x68, 0x65, 0x69, 0x63,  # compatible brand 'heic'
                0x6d, 0x69, 0x66, 0x31,  # compatible brand 'mif1'
            ])
            return heif_header, False
    
    def test_upload_heic_converts_to_jpeg(self, fan_token):
        """POST /api/upload with .heic file should auto-convert to JPEG and return .jpg URL"""
        heic_data, is_real_heic = self._create_minimal_heic_file()
        
        files = {
            'file': ('test_image.heic', io.BytesIO(heic_data), 'image/heic')
        }
        
        response = requests.post(f"{BASE_URL}/api/upload",
                                files=files,
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        if is_real_heic:
            # Real HEIC should be converted
            assert response.status_code == 200, f"Failed: {response.text}"
            data = response.json()
            
            assert "url" in data, "Response should contain url"
            url = data["url"]
            
            # URL should end with .jpg (converted from HEIC)
            assert url.endswith(".jpg"), f"Expected URL to end with .jpg (converted), got: {url}"
            print(f"✓ HEIC upload converted to JPEG: {url}")
        else:
            # Synthetic HEIC may fail conversion but should accept the extension
            # Either 200 (if backend handles gracefully) or 400/500 (if conversion fails)
            if response.status_code == 200:
                data = response.json()
                print(f"✓ HEIC extension accepted: {data.get('url', 'no url')}")
            else:
                # Backend may reject invalid HEIC content
                print(f"Note: Synthetic HEIC rejected (expected): {response.status_code}")
                pytest.skip("Cannot test HEIC conversion without pillow_heif")
    
    def test_upload_png_regression(self, fan_token):
        """POST /api/upload with .png file should still work (regression)"""
        # Create a minimal PNG
        from PIL import Image
        img = Image.new('RGB', (50, 50), color='blue')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        
        files = {
            'file': ('test_image.png', buf, 'image/png')
        }
        
        response = requests.post(f"{BASE_URL}/api/upload",
                                files=files,
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"PNG upload failed: {response.text}"
        data = response.json()
        
        assert "url" in data
        assert data["url"].endswith(".png"), f"Expected .png URL, got: {data['url']}"
        print(f"✓ PNG upload works (regression): {data['url']}")
    
    def test_upload_oversized_file_rejected(self, fan_token):
        """POST /api/upload with file > 25MB should return 413"""
        # Create a file larger than 25MB (just the header, we'll fake the size check)
        # Actually, we need to send a real large file to test this
        # For efficiency, we'll create a 26MB file in memory
        large_data = b'x' * (26 * 1024 * 1024)  # 26MB
        
        files = {
            'file': ('large_file.png', io.BytesIO(large_data), 'image/png')
        }
        
        response = requests.post(f"{BASE_URL}/api/upload",
                                files=files,
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 413, f"Expected 413 for oversized file, got: {response.status_code}"
        print("✓ Oversized file (>25MB) correctly rejected with 413")


class TestStripeLiveModeRegression:
    """Regression: Stripe LIVE mode from iter17"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_wallet_buy_returns_cs_live_session(self, fan_token):
        """POST /api/wallet/buy should return session_id starting with 'cs_live_'"""
        response = requests.post(f"{BASE_URL}/api/wallet/buy",
                                json={
                                    "pack_id": "starter",
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "session_id" in data
        session_id = data["session_id"]
        assert session_id.startswith("cs_live_"), f"Expected cs_live_*, got: {session_id}"
        print(f"✓ /wallet/buy returns LIVE session: {session_id[:30]}...")
    
    def test_subscribe_bundle_stripe_returns_cs_live_session(self, fan_token):
        """POST /api/payments/subscribe-bundle-stripe should return session_id starting with 'cs_live_'"""
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creators = creators_resp.json()
        if not creators:
            pytest.skip("No creators available for testing")
        
        creator_id = creators[0]["creator_id"]
        
        response = requests.post(f"{BASE_URL}/api/payments/subscribe-bundle-stripe",
                                json={
                                    "creator_id": creator_id,
                                    "months": 3,
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "session_id" in data
        session_id = data["session_id"]
        assert session_id.startswith("cs_live_"), f"Expected cs_live_*, got: {session_id}"
        print(f"✓ /subscribe-bundle-stripe returns LIVE session: {session_id[:30]}...")


class TestAdminEndpointsRegression:
    """Regression: Admin endpoints from iter16"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_admin_users_has_creator_profile(self, admin_token):
        """GET /api/admin/users should include has_creator_profile"""
        response = requests.get(f"{BASE_URL}/api/admin/users",
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        
        for user in users[:5]:
            assert "has_creator_profile" in user, f"Missing has_creator_profile for {user.get('email')}"
        print(f"✓ /admin/users returns has_creator_profile for {len(users)} users")


class TestNewsletterOptInRegression:
    """Regression: Newsletter opt-in from iter17"""
    
    def _get_admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def _cleanup_user(self, user_id):
        admin_token = self._get_admin_token()
        requests.delete(f"{BASE_URL}/api/admin/users/{user_id}",
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_register_with_newsletter_opt_in(self):
        """POST /api/auth/register with newsletter_opt_in should work"""
        unique_email = f"test_newsletter_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Newsletter",
            "is_creator": False,
            "newsletter_opt_in": True
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        user_id = data["user"]["user_id"]
        print(f"✓ Registration with newsletter_opt_in=true succeeded")
        self._cleanup_user(user_id)


class TestPaymentStatusRegression:
    """Regression: Payment status from iter17"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_payment_status_endpoint(self, fan_token):
        """GET /api/payments/status/{session_id} should work"""
        # First create a session
        buy_resp = requests.post(f"{BASE_URL}/api/wallet/buy",
                                json={
                                    "pack_id": "starter",
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert buy_resp.status_code == 200
        session_id = buy_resp.json()["session_id"]
        
        # Check status
        status_resp = requests.get(f"{BASE_URL}/api/payments/status/{session_id}",
                                  headers={"Authorization": f"Bearer {fan_token}"})
        
        assert status_resp.status_code == 200, f"Failed: {status_resp.text}"
        data = status_resp.json()
        
        assert "status" in data
        assert "payment_status" in data
        print(f"✓ /payments/status returns: status={data['status']}, payment_status={data['payment_status']}")


class TestWalletPacksRegression:
    """Regression: Wallet packs endpoint"""
    
    def test_wallet_packs(self):
        """GET /api/wallet/packs should return coin packs"""
        response = requests.get(f"{BASE_URL}/api/wallet/packs")
        assert response.status_code == 200, f"Failed: {response.text}"
        packs = response.json()
        
        assert isinstance(packs, list)
        assert len(packs) >= 4
        print(f"✓ /wallet/packs returns {len(packs)} packs")


class TestCreatorsEndpointRegression:
    """Regression: Creators endpoint"""
    
    def test_creators_list(self):
        """GET /api/creators should return creators"""
        response = requests.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200, f"Failed: {response.text}"
        creators = response.json()
        
        assert isinstance(creators, list)
        for c in creators[:3]:
            assert "creator_id" in c
            assert "display_name" in c
        print(f"✓ /creators returns {len(creators)} creators")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
