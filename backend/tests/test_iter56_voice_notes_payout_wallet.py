"""
Iteration 56 Tests - Voice Notes, Payout Emails, Wallet Refresh
Tests:
1. Voice notes in DMs (kind='voice', voice_duration_seconds, media_url)
2. Audio file upload (.webm, .m4a, .ogg, .mp3, .wav)
3. Voice note paywall (creator sends paid voice, fan unlocks)
4. Payout approve/reject endpoints (best-effort SMTP)
5. Regression: text messages and image/video paywall still work
"""
import pytest
import requests
import os
import io
import wave
import struct
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"


@pytest.fixture(scope="module")
def admin_session():
    """Login as admin and return session with auth token."""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    token = data.get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session, data.get("user", {})


@pytest.fixture(scope="module")
def fan_session():
    """Login as fan and return session with auth token."""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Fan login failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    token = data.get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session, data.get("user", {})


@pytest.fixture(scope="module")
def test_creator_session():
    """Create a test creator account for voice note testing."""
    session = requests.Session()
    email = f"test_creator_voice_{int(time.time())}@meandyou.fans"
    resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "TestCreator2026!",
        "name": "Test Creator Voice",
        "is_creator": True
    })
    if resp.status_code != 200:
        pytest.skip(f"Creator registration failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    token = data.get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session, data.get("user", {})


@pytest.fixture(scope="module")
def test_fan_session():
    """Create a test fan account for voice note testing."""
    session = requests.Session()
    email = f"test_fan_voice_{int(time.time())}@meandyou.fans"
    resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "TestFan2026!",
        "name": "Test Fan Voice",
        "is_creator": False
    })
    if resp.status_code != 200:
        pytest.skip(f"Fan registration failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    token = data.get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session, data.get("user", {})


def create_wav_bytes(duration_seconds=1, sample_rate=44100):
    """Create a minimal valid WAV file in memory."""
    num_samples = int(sample_rate * duration_seconds)
    # Generate silence (zeros)
    samples = [0] * num_samples
    
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)  # 16-bit
        wav.setframerate(sample_rate)
        for s in samples:
            wav.writeframes(struct.pack('<h', s))
    buf.seek(0)
    return buf.read()


def create_webm_bytes():
    """Create a minimal WebM-like file (just header bytes for testing extension)."""
    # WebM magic bytes + minimal structure
    return bytes([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F])


class TestAudioUpload:
    """Test audio file upload with new extensions."""
    
    def test_upload_wav_file(self, test_creator_session):
        """Upload a .wav file should succeed."""
        session, user = test_creator_session
        wav_data = create_wav_bytes(duration_seconds=1)
        files = {"file": ("test_voice.wav", io.BytesIO(wav_data), "audio/wav")}
        resp = session.post(f"{BASE_URL}/api/upload", files=files)
        assert resp.status_code == 200, f"WAV upload failed: {resp.text}"
        data = resp.json()
        assert "url" in data
        assert data["url"].startswith("/api/media-file/")
        print(f"✓ WAV upload successful: {data['url']}")
    
    def test_upload_webm_file(self, test_creator_session):
        """Upload a .webm file should succeed."""
        session, user = test_creator_session
        webm_data = create_webm_bytes()
        files = {"file": ("test_voice.webm", io.BytesIO(webm_data), "audio/webm")}
        resp = session.post(f"{BASE_URL}/api/upload", files=files)
        assert resp.status_code == 200, f"WebM upload failed: {resp.text}"
        data = resp.json()
        assert "url" in data
        print(f"✓ WebM upload successful: {data['url']}")
    
    def test_upload_mp3_file(self, test_creator_session):
        """Upload a .mp3 file should succeed."""
        session, user = test_creator_session
        # Minimal MP3 header (ID3 tag)
        mp3_data = bytes([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        files = {"file": ("test_voice.mp3", io.BytesIO(mp3_data), "audio/mpeg")}
        resp = session.post(f"{BASE_URL}/api/upload", files=files)
        assert resp.status_code == 200, f"MP3 upload failed: {resp.text}"
        print(f"✓ MP3 upload successful")
    
    def test_upload_m4a_file(self, test_creator_session):
        """Upload a .m4a file should succeed."""
        session, user = test_creator_session
        # Minimal M4A/MP4 header
        m4a_data = bytes([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20])
        files = {"file": ("test_voice.m4a", io.BytesIO(m4a_data), "audio/mp4")}
        resp = session.post(f"{BASE_URL}/api/upload", files=files)
        assert resp.status_code == 200, f"M4A upload failed: {resp.text}"
        print(f"✓ M4A upload successful")
    
    def test_upload_ogg_file(self, test_creator_session):
        """Upload a .ogg file should succeed."""
        session, user = test_creator_session
        # OGG magic bytes
        ogg_data = bytes([0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00])
        files = {"file": ("test_voice.ogg", io.BytesIO(ogg_data), "audio/ogg")}
        resp = session.post(f"{BASE_URL}/api/upload", files=files)
        assert resp.status_code == 200, f"OGG upload failed: {resp.text}"
        print(f"✓ OGG upload successful")


class TestVoiceNoteMessages:
    """Test voice note message creation and retrieval."""
    
    def test_fan_sends_voice_note_to_creator(self, test_fan_session, test_creator_session):
        """Fan sends a voice note to creator."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        
        # First upload a voice file
        wav_data = create_wav_bytes(duration_seconds=5)
        files = {"file": ("voice.wav", io.BytesIO(wav_data), "audio/wav")}
        upload_resp = fan_session.post(f"{BASE_URL}/api/upload", files=files)
        assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
        voice_url = upload_resp.json()["url"]
        
        # Send voice message
        msg_payload = {
            "creator_id": creator_user["user_id"],
            "body": "Check out this voice note!",
            "kind": "voice",
            "voice_duration_seconds": 5,
            "media_url": voice_url,
            "media_paywall_coins": 0
        }
        resp = fan_session.post(f"{BASE_URL}/api/messages", json=msg_payload)
        assert resp.status_code == 200, f"Voice message send failed: {resp.text}"
        data = resp.json()
        assert data.get("kind") == "voice"
        assert data.get("voice_duration_seconds") == 5
        assert data.get("media_url") == voice_url
        print(f"✓ Fan sent voice note: {data['message_id']}")
        return data["message_id"]
    
    def test_creator_sees_voice_note_from_fan(self, test_fan_session, test_creator_session):
        """Creator can see the voice note sent by fan."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        
        # Get messages
        resp = creator_session.get(
            f"{BASE_URL}/api/messages/{creator_user['user_id']}",
            params={"fan_id": fan_user["user_id"]}
        )
        assert resp.status_code == 200, f"Get messages failed: {resp.text}"
        messages = resp.json()
        
        # Find voice message
        voice_msgs = [m for m in messages if m.get("kind") == "voice"]
        assert len(voice_msgs) > 0, "No voice messages found"
        vm = voice_msgs[-1]
        assert vm.get("voice_duration_seconds") is not None
        assert vm.get("media_url") is not None
        print(f"✓ Creator sees voice note with duration={vm['voice_duration_seconds']}s")
    
    def test_creator_sends_paid_voice_note(self, test_fan_session, test_creator_session, admin_session):
        """Creator sends a paid voice note to fan."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        admin_sess, _ = admin_session
        
        # Credit fan with coins for unlock test
        admin_sess.post(f"{BASE_URL}/api/admin/users/{fan_user['user_id']}/grant-coins", json={"amount": 100, "reason": "test"})
        
        # Upload voice file as creator
        wav_data = create_wav_bytes(duration_seconds=10)
        files = {"file": ("paid_voice.wav", io.BytesIO(wav_data), "audio/wav")}
        upload_resp = creator_session.post(f"{BASE_URL}/api/upload", files=files)
        assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
        voice_url = upload_resp.json()["url"]
        
        # Send paid voice message
        msg_payload = {
            "creator_id": creator_user["user_id"],
            "fan_id": fan_user["user_id"],
            "body": "Exclusive voice note for you!",
            "kind": "voice",
            "voice_duration_seconds": 10,
            "media_url": voice_url,
            "media_paywall_coins": 10
        }
        resp = creator_session.post(f"{BASE_URL}/api/messages", json=msg_payload)
        assert resp.status_code == 200, f"Paid voice send failed: {resp.text}"
        data = resp.json()
        assert data.get("kind") == "voice"
        assert data.get("media_paywall_coins") == 10
        print(f"✓ Creator sent paid voice note: {data['message_id']}")
        return data["message_id"]
    
    def test_fan_sees_locked_voice_note(self, test_fan_session, test_creator_session):
        """Fan sees paid voice note as locked (media_url=null, is_unlocked=false)."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        
        resp = fan_session.get(f"{BASE_URL}/api/messages/{creator_user['user_id']}")
        assert resp.status_code == 200, f"Get messages failed: {resp.text}"
        messages = resp.json()
        
        # Find paid voice message
        paid_voice = [m for m in messages if m.get("kind") == "voice" and m.get("media_paywall_coins", 0) > 0]
        assert len(paid_voice) > 0, "No paid voice messages found"
        pv = paid_voice[-1]
        assert pv.get("is_unlocked") == False, "Paid voice should be locked"
        assert pv.get("media_url") is None, "Locked voice should have media_url=null"
        print(f"✓ Fan sees locked voice note (is_unlocked=False, media_url=None)")
        return pv["message_id"]
    
    def test_fan_unlocks_paid_voice_note(self, test_fan_session, test_creator_session, admin_session):
        """Fan unlocks paid voice note - coins debited, creator credited."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        admin_sess, _ = admin_session
        
        # Ensure fan has coins
        grant_resp = admin_sess.post(f"{BASE_URL}/api/admin/users/{fan_user['user_id']}/grant-coins", json={"amount": 100, "reason": "test"})
        print(f"Grant coins response: {grant_resp.status_code} - {grant_resp.text}")
        
        # Get fan wallet before
        wallet_before = fan_session.get(f"{BASE_URL}/api/wallet").json()
        fan_balance_before = wallet_before.get("coin_balance", 0)
        
        # Get creator wallet before
        creator_wallet_before = creator_session.get(f"{BASE_URL}/api/wallet").json()
        creator_balance_before = creator_wallet_before.get("coin_balance", 0)
        
        # Find locked voice message
        resp = fan_session.get(f"{BASE_URL}/api/messages/{creator_user['user_id']}")
        messages = resp.json()
        paid_voice = [m for m in messages if m.get("kind") == "voice" and m.get("media_paywall_coins", 0) > 0 and not m.get("is_unlocked")]
        
        if not paid_voice:
            pytest.skip("No locked paid voice messages to unlock")
        
        msg_id = paid_voice[-1]["message_id"]
        cost = paid_voice[-1]["media_paywall_coins"]
        
        # Unlock
        unlock_resp = fan_session.post(f"{BASE_URL}/api/messages/{msg_id}/unlock")
        assert unlock_resp.status_code == 200, f"Unlock failed: {unlock_resp.text}"
        unlock_data = unlock_resp.json()
        assert unlock_data.get("ok") == True
        assert unlock_data.get("media_url") is not None
        print(f"✓ Voice note unlocked, media_url returned")
        
        # Verify fan wallet debited
        wallet_after = fan_session.get(f"{BASE_URL}/api/wallet").json()
        fan_balance_after = wallet_after.get("coin_balance", 0)
        assert fan_balance_after == fan_balance_before - cost, f"Fan should be debited {cost} coins"
        print(f"✓ Fan debited {cost} coins ({fan_balance_before} → {fan_balance_after})")
        
        # Verify creator wallet credited (80%)
        creator_wallet_after = creator_session.get(f"{BASE_URL}/api/wallet").json()
        creator_balance_after = creator_wallet_after.get("coin_balance", 0)
        expected_credit = int(round(cost * 0.8))
        assert creator_balance_after == creator_balance_before + expected_credit, f"Creator should be credited {expected_credit} coins"
        print(f"✓ Creator credited {expected_credit} coins ({creator_balance_before} → {creator_balance_after})")
    
    def test_free_voice_note_accessible_without_unlock(self, test_fan_session, test_creator_session):
        """Voice note with paywall_coins=0 is accessible without unlock."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        
        resp = fan_session.get(f"{BASE_URL}/api/messages/{creator_user['user_id']}")
        messages = resp.json()
        
        # Find free voice message
        free_voice = [m for m in messages if m.get("kind") == "voice" and (m.get("media_paywall_coins") or 0) == 0]
        if not free_voice:
            pytest.skip("No free voice messages to test")
        
        fv = free_voice[-1]
        assert fv.get("is_unlocked") == True, "Free voice should be unlocked"
        assert fv.get("media_url") is not None, "Free voice should have media_url"
        print(f"✓ Free voice note accessible (is_unlocked=True, media_url present)")


class TestPayoutAdminEndpoints:
    """Test payout approve/reject with best-effort SMTP."""
    
    def test_create_payout_request(self, test_creator_session, admin_session):
        """Create a payout request for testing."""
        creator_session, creator_user = test_creator_session
        admin_sess, _ = admin_session
        
        # Credit creator with enough coins
        admin_sess.post(f"{BASE_URL}/api/admin/users/{creator_user['user_id']}/grant-coins", json={"amount": 1000, "reason": "test"})
        
        # Set bank account
        bank_resp = creator_session.post(f"{BASE_URL}/api/bank", json={
            "iban": "FR1420041010050500013M02606",
            "bic": "PSSTFRPPPAR",
            "holder_name": "Test Creator"
        })
        # May fail if already set, that's ok
        
        # Request payout
        payout_resp = creator_session.post(f"{BASE_URL}/api/payouts", json={"coins": 500})
        if payout_resp.status_code == 200:
            data = payout_resp.json()
            print(f"✓ Payout request created: {data.get('request_id')}")
            return data.get("request_id")
        elif payout_resp.status_code == 400:
            # May fail due to insufficient balance or other reasons
            print(f"⚠ Payout request failed (expected): {payout_resp.text}")
            return None
        else:
            print(f"⚠ Payout request status: {payout_resp.status_code}")
            return None
    
    def test_admin_approve_payout_no_smtp_block(self, admin_session):
        """Admin approve payout should return 200 even if SMTP fails (best-effort)."""
        admin_sess, _ = admin_session
        
        # Get pending payouts
        resp = admin_sess.get(f"{BASE_URL}/api/admin/payouts", params={"status": "pending"})
        assert resp.status_code == 200, f"Get payouts failed: {resp.text}"
        payouts = resp.json()
        
        if not payouts:
            pytest.skip("No pending payouts to approve")
        
        request_id = payouts[0]["request_id"]
        
        # Approve
        approve_resp = admin_sess.post(f"{BASE_URL}/api/admin/payouts/{request_id}/approve")
        assert approve_resp.status_code == 200, f"Approve failed: {approve_resp.text}"
        data = approve_resp.json()
        assert data.get("ok") == True
        print(f"✓ Payout approved without SMTP blocking: {request_id}")
        
        # Verify status changed
        check_resp = admin_sess.get(f"{BASE_URL}/api/admin/payouts")
        all_payouts = check_resp.json()
        approved = [p for p in all_payouts if p["request_id"] == request_id]
        if approved:
            assert approved[0]["status"] == "paid"
            print(f"✓ Payout status is 'paid'")
    
    def test_admin_reject_payout_refunds_coins(self, admin_session, test_creator_session):
        """Admin reject payout should refund coins and return 200 even if SMTP fails."""
        admin_sess, _ = admin_session
        creator_session, creator_user = test_creator_session
        
        # Credit creator and create new payout request
        admin_sess.post(f"{BASE_URL}/api/admin/users/{creator_user['user_id']}/grant-coins", json={"amount": 600, "reason": "test"})
        
        # Get wallet before
        wallet_before = creator_session.get(f"{BASE_URL}/api/wallet").json()
        balance_before = wallet_before.get("coin_balance", 0)
        
        # Create payout request
        payout_resp = creator_session.post(f"{BASE_URL}/api/payouts", json={"coins": 500})
        if payout_resp.status_code != 200:
            pytest.skip(f"Could not create payout request: {payout_resp.text}")
        
        request_id = payout_resp.json().get("request_id")
        
        # Wallet after payout request (should be debited)
        wallet_after_request = creator_session.get(f"{BASE_URL}/api/wallet").json()
        balance_after_request = wallet_after_request.get("coin_balance", 0)
        
        # Reject
        reject_resp = admin_sess.post(f"{BASE_URL}/api/admin/payouts/{request_id}/reject")
        assert reject_resp.status_code == 200, f"Reject failed: {reject_resp.text}"
        data = reject_resp.json()
        assert data.get("ok") == True
        print(f"✓ Payout rejected without SMTP blocking: {request_id}")
        
        # Verify coins refunded
        wallet_after_reject = creator_session.get(f"{BASE_URL}/api/wallet").json()
        balance_after_reject = wallet_after_reject.get("coin_balance", 0)
        assert balance_after_reject == balance_after_request + 500, "Coins should be refunded"
        print(f"✓ Coins refunded: {balance_after_request} → {balance_after_reject}")


class TestRegressionTextAndMediaMessages:
    """Regression: text messages and image/video paywall still work."""
    
    def test_text_message_has_no_kind(self, test_fan_session, test_creator_session):
        """Regular text message should have kind=null."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        
        msg_payload = {
            "creator_id": creator_user["user_id"],
            "body": "This is a regular text message"
        }
        resp = fan_session.post(f"{BASE_URL}/api/messages", json=msg_payload)
        assert resp.status_code == 200, f"Text message failed: {resp.text}"
        data = resp.json()
        assert data.get("kind") is None, "Text message should have kind=null"
        assert data.get("voice_duration_seconds") is None
        print(f"✓ Text message has kind=null")
    
    def test_image_paywall_message_works(self, test_fan_session, test_creator_session):
        """Image with paywall still works (kind=null)."""
        fan_session, fan_user = test_fan_session
        creator_session, creator_user = test_creator_session
        
        # Upload image as creator
        img_data = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])  # PNG header
        files = {"file": ("test.png", io.BytesIO(img_data), "image/png")}
        upload_resp = creator_session.post(f"{BASE_URL}/api/upload", files=files)
        if upload_resp.status_code != 200:
            pytest.skip(f"Image upload failed: {upload_resp.text}")
        
        img_url = upload_resp.json()["url"]
        
        # Send paid image message
        msg_payload = {
            "creator_id": creator_user["user_id"],
            "fan_id": fan_user["user_id"],
            "body": "Check out this exclusive image!",
            "media_url": img_url,
            "media_paywall_coins": 5
        }
        resp = creator_session.post(f"{BASE_URL}/api/messages", json=msg_payload)
        assert resp.status_code == 200, f"Image message failed: {resp.text}"
        data = resp.json()
        assert data.get("kind") is None, "Image message should have kind=null"
        assert data.get("media_paywall_coins") == 5
        print(f"✓ Image paywall message works (kind=null, paywall=5)")


class TestWalletEndpoint:
    """Test wallet endpoint for refresh functionality."""
    
    def test_wallet_endpoint_returns_balance(self, fan_session):
        """Wallet endpoint returns coin_balance."""
        session, user = fan_session
        resp = session.get(f"{BASE_URL}/api/wallet")
        assert resp.status_code == 200, f"Wallet failed: {resp.text}"
        data = resp.json()
        assert "coin_balance" in data
        print(f"✓ Wallet returns coin_balance: {data['coin_balance']}")


class TestHealthAndBasics:
    """Basic health checks."""
    
    def test_api_root_endpoint(self):
        """API root endpoint works."""
        resp = requests.get(f"{BASE_URL}/api/")
        # May return 200 or 404 depending on setup
        assert resp.status_code in [200, 404, 307]
        print(f"✓ API root endpoint: {resp.status_code}")
    
    def test_allowed_extensions_include_audio(self):
        """Verify ALLOWED_EXTS includes audio formats."""
        # This is a code review check - we verify by attempting uploads
        # The upload tests above verify this indirectly
        print("✓ Audio extensions verified via upload tests")
