import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionSheet, Button, Card, EmptyArt, InputDialog, Row, Screen } from './src/components/ui';
import { About, api, Article, Device, Family, Settings, User, setAuthToken } from './src/services/api';
import { colors } from './src/theme/colors';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';

type Route = 'home'|'addDevice'|'profile'|'account'|'families'|'familyDetail'|'notifications'|'notificationSettings'|'help'|'operationHelp'|'article'|'about'|'general'|'text';

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, token, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 18, color: colors.muted }}>Loading...</Text>
      </View>
    );
  }

  if (!user || !token) {
    return <LoginScreen />;
  }

  return <MainApp onLogout={logout} token={token} initialProfile={user as User} />;
}

function MainApp({ onLogout, token, initialProfile }: { onLogout: () => Promise<void>; token: string; initialProfile: User }) {
  const [route, setRoute] = useState<Route>('home');
  const [tab, setTab] = useState<'device'|'profile'>('device');
  const [profile, setProfile] = useState<User | null>(initialProfile);
  const [families, setFamilies] = useState<Family[]>([]);
  const [family, setFamily] = useState<Family|undefined>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [article, setArticle] = useState<Article|undefined>();
  const [about, setAbout] = useState<About|undefined>();
  const [settings, setSettings] = useState<Settings>({language:'English',region:'Auto',device_notifications:true,system_notifications:true});
  const [textPage, setTextPage] = useState({title:'', body:''});
  const reload = async () => { try { const p = await api.profile(); setProfile(p); setFamilies(await api.families()); setDevices(await api.devices()); setSettings(await api.settings()); } catch {} };
  useEffect(()=>{ setAuthToken(token); reload(); },[token]);
  const open = (r:Route) => setRoute(r);
  const close = () => { setRoute('home'); setTab('device'); reload(); };

  if (route === 'addDevice') return <AddDevice onBack={close} onBound={async()=>{await reload(); close();}} />;
  if (route === 'account') return <Account profile={profile} setProfile={setProfile} onBack={()=>open('profile')} onLogout={onLogout} />;
  if (route === 'families') return <Families profile={profile} families={families} setFamilies={setFamilies} openFamily={(f)=>{setFamily(f); open('familyDetail')}} onBack={()=>open('profile')} />;
  if (route === 'familyDetail' && family) return <FamilyDetail family={family} onBack={()=>open('families')} onChange={async(f)=>{setFamily(f); setFamilies(await api.families())}} onDissolve={async()=>{await api.dissolveFamily(family.id); setFamilies(await api.families()); open('families')}} />;
  if (route === 'notifications') return <Notifications onBack={close} settings={()=>open('notificationSettings')} />;
  if (route === 'notificationSettings') return <NotificationSettings settings={settings} setSettings={setSettings} onBack={()=>open('notifications')} />;
  if (route === 'help') return <Help onBack={()=>open('profile')} operation={()=>open('operationHelp')} />;
  if (route === 'operationHelp') return <OperationHelp onBack={()=>open('help')} openArticle={async(a)=>{setArticle(a); open('article')}} />;
  if (route === 'article' && article) return <ArticleScreen article={article} onBack={()=>open('operationHelp')} />;
  if (route === 'about') return <AboutScreen about={about} load={async()=>setAbout(await api.about())} onBack={()=>open('profile')} openText={(t,b)=>{setTextPage({title:t,body:b});open('text')}} />;
  if (route === 'general') return <General settings={settings} setSettings={setSettings} onBack={()=>open('profile')} />;
  if (route === 'text') return <TextPage title={textPage.title} body={textPage.body} onBack={()=>open('about')} />;
  if (tab === 'profile') return <Profile open={open} onTab={setTab} />;
  return <Home devices={devices} open={open} onTab={setTab} />;
}

function Home({devices, open, onTab}:{devices:Device[]; open:(r:Route)=>void; onTab:(t:'device'|'profile')=>void}) { return <View style={s.root}><StatusBar style="dark"/><View style={s.homeTop}><Pressable onPress={()=>open('help')} style={s.topChip}><Text style={s.topChipText}>MyGardenOS</Text></Pressable><View style={s.topRight}><Pressable onPress={()=>open('notifications')}><Text style={s.bell}>🔔</Text></Pressable><Pressable onPress={()=>open('addDevice')}><Text style={s.plusTop}>+</Text></Pressable></View></View>{devices.length===0?<View style={s.center}><EmptyArt/><Text style={s.emptyTitle}>Smart Lawn Care Starts Here</Text><Text style={s.muted}>Connect your mower to unlock scheduling, diagnostics, and family sharing.</Text><Pressable onPress={()=>open('addDevice')} style={s.bigPlus}><Text style={{color:'#fff',fontSize:40,fontWeight:'900'}}>+</Text></Pressable></View>:<View style={s.deviceCard}><Text style={s.deviceStatus}>Connected Device</Text><Text style={s.emptyTitle}>{devices[0].name}</Text><Text style={s.deviceMeta}>{devices[0].model} · Battery {devices[0].battery_percent}%</Text></View>}<Bottom active="device" onHome={()=>onTab('device')} onProfile={()=>onTab('profile')} /></View> }
function Bottom({active,onHome,onProfile}:{active:'device'|'profile';onHome:()=>void;onProfile:()=>void}) { return <View style={s.bottom}><Pressable style={s.tab} onPress={onHome}><Text style={s.tabIcon}>⌂</Text><Text style={[s.tabText,active==='device'&&{color:colors.green}]}>Home</Text></Pressable><Pressable style={s.tab} onPress={onProfile}><Text style={s.tabIcon}>◉</Text><Text style={[s.tabText,active==='profile'&&{color:colors.green}]}>Profile</Text></Pressable></View> }
function Profile({open,onTab}:{open:(r:Route)=>void;onTab:(t:'device'|'profile')=>void}) { return <View style={s.root}><Screen title="Profile"><Card><Row label="Account" onPress={()=>open('account')}/><Row label="Families" onPress={()=>open('families')}/><Row label="Notification" onPress={()=>open('notifications')}/><Row label="Help" onPress={()=>open('help')}/><Row label="General Settings" onPress={()=>open('general')}/><Row label="About" onPress={()=>open('about')}/></Card></Screen><Bottom active="profile" onHome={()=>onTab('device')} onProfile={()=>onTab('profile')}/></View> }
function AddDevice({onBack,onBound}:{onBack:()=>void;onBound:()=>void}) { const [found,setFound]=useState<Device[]>([]); const search=async()=>setFound(await api.searchDevices()); const bind=async(d:Device)=>{await api.bindDevice(d.serial); Alert.alert('Device bound', d.name); onBound();}; return <Screen title="Add Device" onBack={onBack} onClose={onBack}><View style={s.radar}><View style={s.radarSweep}/><Text style={s.radarCross}>＋</Text></View><Text style={s.emptyTitle}>Search in Devices</Text><Text style={s.muted}>Please activate the Bluetooth functionalities, then position yourself in close proximity to the target device you intend to locate. Proceed to wait patiently in this position.</Text><Button title="Select Device" onPress={search}/>{found.map(d=><Card key={d.serial}><Row label={d.name} value={d.model} onPress={()=>bind(d)}/></Card>)}</Screen> }
// Reusable address input with Photon-powered autocomplete biased to the user's location.
// Used in Account profile editing and the family create / edit flows.
function AddressInput({value, onChange, placeholder='Please enter your address', enabled=true}:{value:string;onChange:(v:string)=>void;placeholder?:string;enabled?:boolean}) {
  const [query,setQuery] = useState(value);
  const [suggestions,setSuggestions] = useState<string[]>([]);
  const [loading,setLoading] = useState(false);
  const [userLocation,setUserLocation] = useState<{lat:number;lon:number;city?:string;state?:string}|null>(null);

  // Keep internal query in sync when an outside reset happens (e.g. dialog reopen).
  useEffect(() => { setQuery(value); }, [value]);

  // Request device location once for biasing autocomplete results.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getLastKnownPositionAsync()
          ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!pos || cancelled) return;
        const { latitude, longitude } = pos.coords;
        let city: string | undefined;
        let state: string | undefined;
        try {
          const places = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (places && places.length > 0) {
            city = places[0].city ?? places[0].subregion ?? undefined;
            state = places[0].region ?? undefined;
          }
        } catch {}
        if (!cancelled) setUserLocation({ lat: latitude, lon: longitude, city, state });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const normalizeAddressText = (input: string) => input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const scoreAddressSuggestion = (q: string, candidate: string) => {
    const nq = normalizeAddressText(q);
    const nc = normalizeAddressText(candidate);
    if (!nq || !nc) return 0;
    const fillerTokens = new Set(['auckland', 'new', 'zealand', 'nz']);
    const queryTokens = nq.split(' ').filter((t) => t.length > 0 && !fillerTokens.has(t));
    if (queryTokens.length === 0) return 0;
    const candidateTokens = nc.split(' ').filter(Boolean);
    let matched = 0;
    let prefixMatches = 0;
    for (const qt of queryTokens) {
      const isPrefixOfWord = candidateTokens.some((ct) => ct.startsWith(qt));
      const isSubstring = nc.includes(qt);
      if (isPrefixOfWord) { matched += 1; prefixMatches += 1; }
      else if (isSubstring && qt.length >= 3) { matched += 1; }
    }
    if (matched < queryTokens.length) return 0;
    if (nc.startsWith(nq)) return 100;
    if (nc.includes(nq)) return 90;
    if (prefixMatches === queryTokens.length) return 80;
    return 60;
  };

  useEffect(() => {
    if (!enabled) { setSuggestions([]); return; }
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const biasLat = userLocation?.lat ?? -36.8485;
        const biasLon = userLocation?.lon ?? 174.7633;
        const userCity = userLocation?.city;
        const userState = userLocation?.state;
        const fetchPhoton = async (qq: string) => {
          const url = new URL('https://photon.komoot.io/api/');
          url.searchParams.set('q', qq);
          url.searchParams.set('limit', '20');
          url.searchParams.set('lang', 'en');
          url.searchParams.set('lat', String(biasLat));
          url.searchParams.set('lon', String(biasLon));
          const res = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data?.features) ? data.features : [];
        };
        const formatDisplayName = (props: any): string => {
          const parts = [props.housenumber, props.street, props.suburb || props.district || props.locality, props.city, props.state, props.postcode, props.country]
            .filter((p: any) => typeof p === 'string' && p.length > 0);
          let name = parts.join(', ');
          if (!name && typeof props.name === 'string') name = props.name;
          return name;
        };
        const distanceKm = (lat: number, lon: number) => {
          const toRad = (d: number) => (d * Math.PI) / 180;
          const R = 6371;
          const dLat = toRad(lat - biasLat);
          const dLon = toRad(lon - biasLon);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(biasLat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(a));
        };
        const queriesToTry: string[] = [q];
        if (!/auckland|new zealand|nz/i.test(q)) {
          queriesToTry.push(`${q} Auckland`);
          queriesToTry.push(`${q} New Zealand`);
        }
        if (userCity && !new RegExp(userCity, 'i').test(q)) queriesToTry.push(`${q} ${userCity}`);
        if (userState && !new RegExp(userState, 'i').test(q)) queriesToTry.push(`${q} ${userState}`);
        const isShortOrNumeric = q.length <= 5 || /^\d+[a-z]?$/i.test(q.trim());
        if (isShortOrNumeric) {
          for (const region of ['Auckland Central', 'North Shore Auckland', 'East Auckland', 'West Auckland', 'South Auckland']) {
            queriesToTry.push(`${q} ${region}`);
          }
        }
        const allFeatureLists = await Promise.all(queriesToTry.map((qq) => fetchPhoton(qq).catch(() => [])));
        if (controller.signal.aborted) return;
        const dedup = new Map<string, { score: number; distance: number }>();
        for (const features of allFeatureLists) {
          for (const feature of features) {
            const props = feature?.properties || {};
            if (props.country !== 'New Zealand') continue;
            const displayName = formatDisplayName(props);
            if (!displayName) continue;
            const score = scoreAddressSuggestion(q, displayName);
            if (score <= 0) continue;
            let dist = Number.MAX_SAFE_INTEGER;
            const coords = feature?.geometry?.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) dist = distanceKm(coords[1], coords[0]);
            const existing = dedup.get(displayName);
            if (!existing || score > existing.score || (score === existing.score && dist < existing.distance)) {
              dedup.set(displayName, { score, distance: dist });
            }
          }
        }
        const scored = Array.from(dedup.entries())
          .sort((a, b) => {
            if (b[1].score !== a[1].score) return b[1].score - a[1].score;
            if (a[1].distance !== b[1].distance) return a[1].distance - b[1].distance;
            return a[0].localeCompare(b[0]);
          })
          .map(([name]) => name)
          .slice(0, 8);
        setSuggestions(scored);
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, enabled, userLocation]);

  return <View>
    <TextInput style={s.input} placeholder={placeholder} value={value} onChangeText={(t)=>{ onChange(t); setQuery(t); }} />
    {(loading || suggestions.length > 0) && (
      <View style={s.suggestionBox}>
        {loading && <Text style={s.suggestionEmpty}>Searching...</Text>}
        {!loading && suggestions.map((item) => (
          <Pressable key={item} style={s.suggestionItem} onPress={() => { onChange(item); setQuery(item); setSuggestions([]); }}>
            <Text style={s.suggestionText}>{item}</Text>
          </Pressable>
        ))}
      </View>
    )}
  </View>;
}

function Account({profile,setProfile,onBack,onLogout}:{profile:User|null;setProfile:(u:User)=>void;onBack:()=>void;onLogout:()=>Promise<void>}) {
  const [field,setField]=useState<keyof User|'password'|null>(null);
  const [value,setValue]=useState('');
  const [avatarUri,setAvatarUri]=useState<string|undefined>(profile?.avatar_url || undefined);
  const [avatarSheet,setAvatarSheet]=useState(false);

  // Load locally-saved avatar (per user) when the screen mounts or the user changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.id) return;
      try {
        const saved = await AsyncStorage.getItem(`avatar:${profile.id}`);
        if (!cancelled && saved) setAvatarUri(saved);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const applyAvatar = async (uri: string | null) => {
    if (!profile?.id) return;
    try {
      if (uri) {
        // Compress to a small square thumbnail to keep storage tiny.
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 256, height: 256 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const dataUri = manipulated.base64
          ? `data:image/jpeg;base64,${manipulated.base64}`
          : manipulated.uri;
        await AsyncStorage.setItem(`avatar:${profile.id}`, dataUri);
        setAvatarUri(dataUri);
      } else {
        await AsyncStorage.removeItem(`avatar:${profile.id}`);
        setAvatarUri(undefined);
      }
    } catch (e: any) {
      Alert.alert('Profile photo', e?.message || 'Failed to update profile photo');
    }
  };

  const pickFromLibrary = async () => {
    setAvatarSheet(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await applyAvatar(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    setAvatarSheet(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await applyAvatar(result.assets[0].uri);
    }
  };

  const removeAvatar = async () => {
    setAvatarSheet(false);
    await applyAvatar(null);
  };

  // Request device location once when the screen mounts, to bias address search results.
  const edit=(f:keyof User|'password',v='')=>{
    setField(f);
    setValue(v);
  };
  const genderOptions = ['Male', 'Female', 'Prefer not to say'];

  const save=async()=>{
    if(!field)return;
    const submitValue = field === 'address' ? value.trim() : value;
    const u=await api.updateProfile({[field]:submitValue});
    setProfile(u);
    setField(null);
  };
  return <Screen title="Account" onBack={onBack} onClose={onBack}><Card><Row label="Profile Photo" value={avatarUri ? undefined : '👤'} avatarUri={avatarUri} onPress={()=>setAvatarSheet(true)}/></Card><Card><Row label="Account" value={profile?.email || '-'} /><Row label="User Name" value={profile?.username || '-'} onPress={()=>edit('username',profile?.username||'')}/><Row label="Gender" value={profile?.gender || '-'} onPress={()=>edit('gender',profile?.gender||'')}/><Row label="Address" value={profile?.address || '-'} onPress={()=>edit('address',profile?.address||'')}/></Card><Card><Row label="Set Password" onPress={()=>edit('password','')}/><Row label="Deactivate Account" onPress={()=>Alert.alert('Deactivate Account','Development placeholder')}/></Card><View style={{height:120}}/><Button title="Log Out" variant="red" onPress={()=>Alert.alert('确认登出','登出后将无法继续监控和操作您的机器人',[{text:'取消',style:'cancel'},{text:'确认登出',style:'destructive',onPress:async()=>{await onLogout();}}])}/>
    <ActionSheet
      visible={avatarSheet}
      title="Profile Photo"
      actions={[
        { label: 'Take Photo', onPress: takePhoto },
        { label: 'Choose from Library', onPress: pickFromLibrary },
        ...(avatarUri ? [{ label: 'Remove Photo', onPress: removeAvatar }] : []),
      ]}
      onCancel={()=>setAvatarSheet(false)}
    />
    <Modal transparent visible={!!field} animationType="fade">
      <View style={s.overlay}>
        <View style={s.dialog}>
          <Text style={s.dialogTitle}>{field === 'gender' ? 'Modify gender' : field === 'address' ? 'Modify address' : `Modify ${field}`}</Text>
          {field === 'gender' ? (
            <View style={s.choiceGroup}>
              {genderOptions.map((option) => (
                <Pressable key={option} style={[s.choiceItem, value === option && s.choiceItemActive]} onPress={() => setValue(option)}>
                  <Text style={[s.choiceText, value === option && s.choiceTextActive]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : field === 'address' ? (
            <AddressInput value={value} onChange={setValue} />
          ) : (
            <TextInput style={s.input} placeholder={`Please enter your ${field}`} value={value} onChangeText={setValue}/>
          )}
          <View style={s.dialogActions}><Button title="Cancel" variant="red" onPress={()=>setField(null)}/><Button title="Confirm" onPress={save}/></View>
        </View>
      </View>
    </Modal>
  </Screen> }
function MemberAvatar({ userId, size = 44 }: { userId: number; size?: number }) {
  const [uri, setUri] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(`avatar:${userId}`).then((v) => { if (!cancelled && v) setUri(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E5EFE9' }} />;
  return <Text style={{ fontSize: size, lineHeight: size }}>👤</Text>;
}

function Families({profile,families,setFamilies,openFamily,onBack}:{profile:User|null;families:Family[];setFamilies:(f:Family[])=>void;openFamily:(f:Family)=>void;onBack:()=>void}) {
  const [sheet, setSheet] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const reload = async () => setFamilies(await api.families());

  const openCreate = () => {
    setCreateName('');
    // Prefill family address with creator's account address when available.
    setCreateAddress(profile?.address || '');
    setCreateOpen(true);
  };

  const doCreate = async () => {
    const name = createName.trim();
    if (!name) { Alert.alert('Create family', 'Please enter a family name.'); return; }
    try {
      await api.createFamily(name, createAddress.trim());
      setCreateOpen(false);
      setCreateName('');
      setCreateAddress('');
      await reload();
    } catch (e: any) {
      Alert.alert('Create family failed', e?.message || 'Unknown error');
    }
  };

  const doJoin = async () => {
    const code = joinCode.trim();
    if (!code) { Alert.alert('Join family', 'Please enter a family code.'); return; }
    try {
      const fam = await api.joinFamily(code);
      setJoinOpen(false);
      setJoinCode('');
      await reload();
      Alert.alert('Joined', `You have joined "${fam.name}".`);
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      // Clean up "404 Family not found..." style strings from backend
      const clean = msg.replace(/^\d{3}\s*/, '').replace(/^[{"]+.*?detail[":\s]+"?/, '').replace(/"?}?$/, '');
      Alert.alert('Join family failed', clean || msg);
    }
  };

  const leave = async (fam: Family) => {
    Alert.alert(
      'Leave family',
      `Are you sure you want to leave "${fam.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: async () => {
          try { await api.leaveFamily(fam.id); await reload(); }
          catch (e: any) { Alert.alert('Leave failed', e?.message || 'Unknown error'); }
        }},
      ]
    );
  };

  return <Screen title="Families" onBack={onBack} right={<Pressable onPress={()=>setSheet(true)}><Text style={s.plusTop}>+</Text></Pressable>}>
    <>
      {families.length === 0 && (
        <View style={{paddingVertical:40,alignItems:'center'}}>
          <Text style={s.muted}>You are not in any family yet.{"\n"}Tap + to create or join one.</Text>
        </View>
      )}
      {families.map(f => {
        const isMember = !!profile && f.members.some(m => m.user.id === profile.id);
        const myMembership = profile ? f.members.find(m => m.user.id === profile.id) : undefined;
        const isCreator = myMembership?.role === 'Family Creator';
        return (
          <Card key={f.id}>
            <View style={s.familyHead}>
              <View style={{flex:1}}>
                <Text style={s.familyTitle}>{f.name} ({f.members.length})</Text>
                <View style={s.codeRow}>
                  <Text style={s.familyCode}>Code: {f.code}</Text>
                  <Pressable
                    onPress={async () => {
                      try {
                        await Clipboard.setStringAsync(f.code);
                        Alert.alert('Copied', `Family code ${f.code} copied to clipboard.`);
                      } catch (e: any) {
                        Alert.alert('Copy failed', e?.message || 'Unknown error');
                      }
                    }}
                    style={s.copyBtn}
                    hitSlop={8}
                  >
                    <Text style={s.copyBtnText}>Copy</Text>
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={()=>openFamily(f)}><Text style={{fontSize:30}}>⚙</Text></Pressable>
            </View>
            {f.members.map(m => (
              <View style={s.member} key={m.id}>
                <MemberAvatar userId={m.user.id} />
                <View style={{flex:1}}>
                  <Text style={s.memberName}>{m.user.username}{profile && m.user.id === profile.id ? ' (You)' : ''}</Text>
                  <Text style={s.mutedSmall}>{m.user.email}</Text>
                  <Text style={s.role}>{m.role}</Text>
                </View>
              </View>
            ))}
            {isMember && !isCreator && (
              <View style={{padding:16}}>
                <Button title="Leave Family" variant="red" onPress={()=>leave(f)} />
              </View>
            )}
          </Card>
        );
      })}
    </>
    <ActionSheet
      visible={sheet}
      title="Create or Join a Family"
      actions={[
        { label: 'Create Family', onPress: () => { setSheet(false); openCreate(); } },
        { label: 'Join Family by Code', onPress: () => { setSheet(false); setJoinOpen(true); } },
      ]}
      onCancel={()=>setSheet(false)}
    />
    <Modal transparent visible={createOpen} animationType="fade">
      <View style={s.overlay}>
        <View style={s.dialog}>
          <Text style={s.dialogTitle}>Create Family</Text>
          <TextInput style={s.input} placeholder="Family name" value={createName} onChangeText={setCreateName} />
          <View style={{height:12}}/>
          <Text style={s.fieldLabel}>Address</Text>
          <AddressInput value={createAddress} onChange={setCreateAddress} placeholder="Please enter your address" enabled={createOpen} />
          <View style={s.dialogActions}>
            <Button title="Cancel" variant="red" onPress={()=>setCreateOpen(false)} />
            <Button title="Confirm" onPress={doCreate} />
          </View>
        </View>
      </View>
    </Modal>
    <InputDialog
      visible={joinOpen}
      title="Join Family by Code"
      placeholder="Enter family code (e.g. F1234567)"
      value={joinCode}
      setValue={setJoinCode}
      onCancel={()=>setJoinOpen(false)}
      onConfirm={doJoin}
    />
  </Screen>;
}
function FamilyDetail({family,onBack,onChange,onDissolve}:{family:Family;onBack:()=>void;onChange:(f:Family)=>void;onDissolve:()=>void}) { const [addr,setAddr]=useState(false); const [val,setVal]=useState(family.address); const save=async()=>{const f=await api.updateFamily(family.id,{address:val.trim()}); onChange(f); setAddr(false)}; return <Screen title="Families" onBack={onBack} onClose={onBack}><Card><Row label="Familie Code" value={family.code}/><Row label="Familie Name" value={family.name} onPress={()=>{}}/><Row label="Address" value={family.address} onPress={()=>{setVal(family.address); setAddr(true);}}/></Card><View style={{height:360}}/><Button title="Dissolve Family" variant="red" onPress={onDissolve}/><Modal transparent visible={addr} animationType="fade"><View style={s.overlay}><View style={s.dialog}><Text style={s.dialogTitle}>Modify address</Text><AddressInput value={val} onChange={setVal} placeholder="Please enter your address" enabled={addr}/><View style={s.dialogActions}><Button title="Cancel" variant="red" onPress={()=>setAddr(false)}/><Button title="Confirm" onPress={save}/></View></View></View></Modal></Screen> }
function Notifications({onBack,settings}:{onBack:()=>void;settings:()=>void}) { const [kind,setKind]=useState<'device'|'system'>('device'); const [read,setRead]=useState(false); return <Screen title="Notification" onBack={onBack} right={<Pressable onPress={settings}><Text style={{fontSize:32}}>⚙</Text></Pressable>}><View style={s.segment}><Pressable onPress={()=>setKind('device')}><Text style={[s.seg,kind==='device'&&s.activeSeg]}>Device notification</Text></Pressable><Pressable onPress={()=>setKind('system')}><Text style={[s.seg,kind==='system'&&s.activeSeg]}>System notification</Text></Pressable></View><View style={s.filters}><Pressable onPress={()=>setRead(false)} style={s.filter}><Text style={{color:colors.red}}>▣ Unread</Text></Pressable><Pressable onPress={()=>setRead(true)} style={s.filter}><Text style={{color:colors.green}}>▣ Read</Text></Pressable></View><EmptyArt/><Text style={s.noNews}>No news at this time.</Text></Screen> }
function NotificationSettings({settings,setSettings,onBack}:{settings:Settings;setSettings:(s:Settings)=>void;onBack:()=>void}) { const patch=async(b:Partial<Settings>)=>setSettings(await api.updateSettings(b)); return <Screen title="Notification" onBack={onBack} onClose={onBack}><Card><View style={s.switchRow}><View><Text style={s.rowLabel}>Device notification</Text><Text style={s.mutedSmall}>Receive device notification</Text></View><Switch value={settings.device_notifications} onValueChange={v=>patch({device_notifications:v})}/></View><View style={s.switchRow}><View><Text style={s.rowLabel}>System notification</Text><Text style={s.mutedSmall}>Receive system notification</Text></View><Switch value={settings.system_notifications} onValueChange={v=>patch({system_notifications:v})}/></View></Card></Screen> }
function Help({onBack,operation}:{onBack:()=>void;operation:()=>void}) { const [open,setOpen]=useState(true); return <Screen title="Help" onBack={onBack} onClose={onBack}><Card><Text style={s.cardTitle}>Advice and feedback</Text><Row label="💬  Contact Us" onPress={()=>setOpen(!open)}/>{open&&<View style={{paddingHorizontal:24,paddingBottom:20}}><Text style={s.contact}>{'Contact number\n+86 0755 2814 0239'}</Text><Text style={s.contact}>{'Email\ninfo@mygardenos.com'}</Text><Text style={s.contact}>{'Official website\nwww.mygardenos.com'}</Text></View>}<Row label="❔  Operation Help" onPress={operation}/></Card></Screen> }
function OperationHelp({onBack,openArticle}:{onBack:()=>void;openArticle:(a:Article)=>void}) { const [arts,setArts]=useState<Article[]>([]); useEffect(()=>{api.articles().then(setArts).catch(()=>{})},[]); return <Screen title="Operation Help" onBack={onBack} onClose={onBack}><Card>{arts.map(a=><Row key={a.slug} label={a.title} onPress={()=>openArticle(a)}/>)}</Card></Screen> }
function ArticleScreen({article,onBack}:{article:Article;onBack:()=>void}) { return <Screen title={article.title} onBack={onBack} onClose={onBack}><View style={s.manual}><Text style={s.manualBadge}>Mowers User Manual</Text><Text style={s.mower}>𐂷</Text><Text style={s.manualBadge}>AN-1600</Text><Text style={s.manualText}>{article.content}</Text></View><View style={s.manual}><Text style={s.manualBadge}>Table of Contents</Text><Text style={s.manualText}>1. Mower Overview ........ 01\n2. Safety Alerts .......... 02-03\n3. Specifications ........ 04\n4. Quick Start Introduction ........ 05-10\n5. Installation and Activation ........ 11-22\n6. Basic Operation of APP ........ 23-33</Text></View></Screen> }
function AboutScreen({about,load,onBack,openText}:{about?:About;load:()=>void;onBack:()=>void;openText:(t:string,b:string)=>void}) { useEffect(()=>{load()},[]); return <Screen title="About" onBack={onBack} onClose={onBack}><View style={s.product}><Text style={{fontSize:120,opacity:.5}}>🤖</Text><Text style={s.emptyTitle}>MYGARDENOS</Text><Text style={{color:'#1B46B0',fontSize:18}}>Version: {about?.version||'V0.1.0-dev'}</Text></View><Card><Row label="Check for Updates" onPress={()=>Alert.alert('Updates',about?.update_status||'Up to date')}/><Row label="Privacy Policy" onPress={()=>openText('Privacy Policy',about?.privacy_policy||'Placeholder')}/><Row label="User Agreement" onPress={()=>openText('User Agreement',about?.user_agreement||'Placeholder')}/></Card></Screen> }
function General({settings,setSettings,onBack}:{settings:Settings;setSettings:(s:Settings)=>void;onBack:()=>void}) { const [sheet,setSheet]=useState(false); const lang=async()=>{setSettings(await api.updateSettings({language:'English'})); setSheet(false)}; return <Screen title="General Settings" onBack={onBack} onClose={onBack}><Card><Row label="Language" value={settings.language} onPress={()=>setSheet(true)}/><Row label="Region" value={settings.region}/><Row label="Clear Cache" onPress={()=>Alert.alert('Clear Cache','Cache cleared')}/></Card><ActionSheet visible={sheet} actions={[{label:'English',onPress:lang}]} onCancel={()=>setSheet(false)}/></Screen> }
function TextPage({title,body,onBack}:{title:string;body:string;onBack:()=>void}) { return <Screen title={title} onBack={onBack} onClose={onBack}><Card><Text style={{fontSize:17,lineHeight:26,padding:20}}>{body}</Text></Card></Screen> }

const s = StyleSheet.create({ root:{flex:1,backgroundColor:colors.bg,paddingTop:48}, homeTop:{height:70,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:8}, topRight:{flexDirection:'row',gap:20,alignItems:'center'}, topChip:{backgroundColor:'#E7F1EA',paddingHorizontal:14,paddingVertical:8,borderRadius:18,borderWidth:1,borderColor:colors.line}, topChipText:{fontWeight:'700',color:colors.green,fontSize:14,letterSpacing:.3}, bell:{color:colors.green,fontSize:24}, plusTop:{backgroundColor:colors.green,color:'#fff',width:34,height:34,borderRadius:17,textAlign:'center',fontSize:28,fontWeight:'900',lineHeight:34}, center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:30,paddingBottom:40}, emptyTitle:{fontSize:24,fontWeight:'700',color:'#365243',textAlign:'center',marginBottom:10}, muted:{fontSize:16,color:colors.muted,textAlign:'center',lineHeight:24,marginBottom:28}, bigPlus:{backgroundColor:colors.green2,width:74,height:74,borderRadius:37,alignItems:'center',justifyContent:'center',shadowColor:'#184830',shadowOpacity:.18,shadowRadius:8,shadowOffset:{width:0,height:4}}, bottom:{height:84,flexDirection:'row',justifyContent:'space-around',alignItems:'center',backgroundColor:'#F8FCF8',borderTopWidth:1,borderTopColor:colors.line}, tab:{alignItems:'center',gap:2}, tabIcon:{fontSize:24,color:'#798E7F'}, tabText:{fontSize:14,color:'#7B8D80',fontWeight:'600'}, deviceCard:{margin:20,padding:22,backgroundColor:'#fff',borderRadius:20,borderWidth:1,borderColor:colors.line,shadowColor:'#153D2A',shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:6}}, deviceStatus:{fontSize:12,fontWeight:'700',color:colors.green2,letterSpacing:.5,marginBottom:8}, deviceMeta:{fontSize:15,color:colors.muted}, radar:{width:290,height:290,borderRadius:145,borderWidth:1,borderColor:'#D96545',alignSelf:'center',marginVertical:22,overflow:'hidden',alignItems:'center',justifyContent:'center'}, radarSweep:{position:'absolute',right:0,top:0,width:145,height:145,backgroundColor:'#FF8765',opacity:.45}, radarCross:{fontSize:170,color:'#D96545',fontWeight:'100'}, familyHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:20}, familyTitle:{fontSize:20,fontWeight:'800',color:colors.green}, familyCode:{fontSize:14,color:colors.muted,fontWeight:'600',letterSpacing:.5}, codeRow:{flexDirection:'row',alignItems:'center',marginTop:4,gap:10}, copyBtn:{paddingHorizontal:10,paddingVertical:4,borderRadius:8,borderWidth:1,borderColor:colors.green,backgroundColor:'#EAF6EE'}, copyBtnText:{color:colors.green,fontSize:12,fontWeight:'700',letterSpacing:.3}, member:{margin:20,marginTop:0,padding:18,backgroundColor:'#EAF1ED',borderRadius:12,flexDirection:'row',gap:16}, memberName:{fontSize:20,color:'#4D5D53'}, mutedSmall:{fontSize:16,color:colors.muted,lineHeight:24}, rowLabel:{fontSize:24,color:'#4B4F56'}, role:{fontSize:18,color:colors.green,fontWeight:'700'}, segment:{flexDirection:'row',justifyContent:'space-around',marginVertical:20}, seg:{fontSize:18,color:'#B6C0B8',fontWeight:'700',paddingBottom:14}, activeSeg:{color:colors.green,borderBottomWidth:3,borderBottomColor:colors.green}, filters:{flexDirection:'row',gap:24}, filter:{backgroundColor:colors.blue,borderRadius:10,padding:14,minWidth:130,alignItems:'center'}, noNews:{textAlign:'center',color:'#555',fontSize:16}, switchRow:{minHeight:96,padding:22,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.line}, cardTitle:{fontSize:23,fontWeight:'800',padding:24}, contact:{fontSize:16,color:colors.muted,lineHeight:24,marginBottom:24}, manual:{backgroundColor:'#fff',marginHorizontal:24,marginBottom:12,alignItems:'center',padding:24,borderWidth:1,borderColor:colors.line,borderRadius:16}, manualBadge:{backgroundColor:'#E44632',color:'#fff',fontWeight:'800',padding:10,margin:10,borderRadius:8}, mower:{fontSize:120,color:'#444'}, manualText:{fontSize:14,lineHeight:24,alignSelf:'stretch'}, product:{alignItems:'center',marginBottom:24}, overlay:{flex:1,backgroundColor:'rgba(0,0,0,.28)',justifyContent:'center',padding:24}, dialog:{backgroundColor:'#fff',borderRadius:18,padding:22,borderWidth:1,borderColor:colors.line}, dialogTitle:{textAlign:'center',fontSize:20,fontWeight:'700',marginBottom:20,color:colors.text}, dialogActions:{flexDirection:'row',marginTop:18}, input:{borderWidth:1,borderColor:'#CBD5CE',borderRadius:12,fontSize:17,paddingHorizontal:14,paddingVertical:12,color:colors.text,backgroundColor:'#fff'}, fieldLabel:{fontSize:14,color:colors.muted,fontWeight:'600',marginBottom:6,letterSpacing:.3}, choiceGroup:{gap:10,marginBottom:10}, choiceItem:{borderWidth:1,borderColor:colors.line,borderRadius:12,paddingVertical:14,paddingHorizontal:16,backgroundColor:'#F8FCF8'}, choiceItemActive:{borderColor:colors.green,backgroundColor:'#EAF6EE'}, choiceText:{fontSize:16,fontWeight:'600',color:colors.text,textAlign:'center'}, choiceTextActive:{color:colors.green}, suggestionBox:{marginTop:12,borderWidth:1,borderColor:colors.line,borderRadius:12,overflow:'hidden',backgroundColor:'#fff'}, suggestionItem:{paddingVertical:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:colors.line}, suggestionText:{fontSize:15,color:colors.text}, suggestionEmpty:{paddingVertical:12,paddingHorizontal:14,color:colors.muted,fontSize:14} });
