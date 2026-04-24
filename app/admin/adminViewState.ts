import type { Tournament } from '@/lib/types'

export function defaultTournamentDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export type TournamentCreateState = {
  tName: string
  tDesc: string
  tDate: string
  tFormat: string
  tPart: 'single' | 'double'
  playoffSize: 4 | 8 | 16
  creatingTournament: boolean
}

export const initialTournamentCreate: TournamentCreateState = {
  tName: '',
  tDesc: '',
  tDate: defaultTournamentDate(),
  tFormat: 'round_robin',
  tPart: 'single',
  playoffSize: 8,
  creatingTournament: false,
}

export type TournamentCreateAction =
  | { type: 'setTName'; value: string }
  | { type: 'setTDesc'; value: string }
  | { type: 'setTDate'; value: string }
  | { type: 'setTFormat'; value: string }
  | { type: 'setTPart'; value: 'single' | 'double' }
  | { type: 'setPlayoffSize'; value: 4 | 8 | 16 }
  | { type: 'setCreating'; value: boolean }
  | { type: 'resetAfterCreate' }

export function tournamentCreateReducer(
  state: TournamentCreateState,
  action: TournamentCreateAction
): TournamentCreateState {
  switch (action.type) {
    case 'setTName':
      return { ...state, tName: action.value }
    case 'setTDesc':
      return { ...state, tDesc: action.value }
    case 'setTDate':
      return { ...state, tDate: action.value }
    case 'setTFormat':
      return { ...state, tFormat: action.value }
    case 'setTPart':
      return { ...state, tPart: action.value }
    case 'setPlayoffSize':
      return { ...state, playoffSize: action.value }
    case 'setCreating':
      return { ...state, creatingTournament: action.value }
    case 'resetAfterCreate':
      return {
        ...state,
        tName: '',
        tDesc: '',
        tDate: defaultTournamentDate(),
        creatingTournament: false,
      }
    default:
      return state
  }
}

export type GroupClusterState = {
  newGroupName: string
  editingGroupId: number | null
  editGroupName: string
}

export const initialGroupCluster: GroupClusterState = {
  newGroupName: '',
  editingGroupId: null,
  editGroupName: '',
}

export type GroupClusterAction =
  | { type: 'setNewGroupName'; value: string }
  | { type: 'startEdit'; id: number; name: string }
  | { type: 'setEditGroupName'; value: string }
  | { type: 'cancelEdit' }
  | { type: 'resetNewGroup' }

export function groupClusterReducer(
  state: GroupClusterState,
  action: GroupClusterAction
): GroupClusterState {
  switch (action.type) {
    case 'setNewGroupName':
      return { ...state, newGroupName: action.value }
    case 'startEdit':
      return {
        ...state,
        editingGroupId: action.id,
        editGroupName: action.name,
      }
    case 'setEditGroupName':
      return { ...state, editGroupName: action.value }
    case 'cancelEdit':
      return { ...state, editingGroupId: null, editGroupName: '' }
    case 'resetNewGroup':
      return { ...state, newGroupName: '' }
    default:
      return state
  }
}

export type PlayerListState = {
  newName: string
  newEmoji: string
  showPicker: boolean
  editingPlayerId: number | null
  editPlayerName: string
  editPlayerEmoji: string
  showEditPlayerPicker: boolean
}

export const initialPlayerList: PlayerListState = {
  newName: '',
  newEmoji: '🎾',
  showPicker: false,
  editingPlayerId: null,
  editPlayerName: '',
  editPlayerEmoji: '🎾',
  showEditPlayerPicker: false,
}

export type PlayerListAction =
  | { type: 'setNewName'; value: string }
  | { type: 'setNewEmoji'; value: string }
  | { type: 'toggleNewPicker' }
  | { type: 'setShowPicker'; value: boolean }
  | { type: 'startEditPlayer'; id: number; name: string; emoji: string }
  | { type: 'setEditPlayerName'; value: string }
  | { type: 'setEditPlayerEmoji'; value: string }
  | { type: 'toggleEditPlayerPicker' }
  | { type: 'setShowEditPlayerPicker'; value: boolean }
  | { type: 'cancelPlayerEdit' }
  | { type: 'afterPlayerAdd' }

export function playerListReducer(
  state: PlayerListState,
  action: PlayerListAction
): PlayerListState {
  switch (action.type) {
    case 'setNewName':
      return { ...state, newName: action.value }
    case 'setNewEmoji':
      return { ...state, newEmoji: action.value }
    case 'toggleNewPicker':
      return { ...state, showPicker: !state.showPicker }
    case 'setShowPicker':
      return { ...state, showPicker: action.value }
    case 'startEditPlayer':
      return {
        ...state,
        editingPlayerId: action.id,
        editPlayerName: action.name,
        editPlayerEmoji: action.emoji,
        showEditPlayerPicker: false,
      }
    case 'setEditPlayerName':
      return { ...state, editPlayerName: action.value }
    case 'setEditPlayerEmoji':
      return { ...state, editPlayerEmoji: action.value }
    case 'toggleEditPlayerPicker':
      return { ...state, showEditPlayerPicker: !state.showEditPlayerPicker }
    case 'setShowEditPlayerPicker':
      return { ...state, showEditPlayerPicker: action.value }
    case 'cancelPlayerEdit':
      return {
        ...state,
        editingPlayerId: null,
        showEditPlayerPicker: false,
      }
    case 'afterPlayerAdd':
      return {
        ...state,
        newName: '',
        newEmoji: '🎾',
        showPicker: false,
      }
    default:
      return state
  }
}

export type TournamentListEditState = {
  editingTournamentId: number | null
  editTourName: string
  editTourDesc: string
  editTourDate: string
  editTourStatus: 'active' | 'archived'
}

export const initialTournamentListEdit: TournamentListEditState = {
  editingTournamentId: null,
  editTourName: '',
  editTourDesc: '',
  editTourDate: '',
  editTourStatus: 'active',
}

export type TournamentListEditAction =
  | { type: 'startEdit'; t: Tournament }
  | { type: 'setEditTourName'; value: string }
  | { type: 'setEditTourDesc'; value: string }
  | { type: 'setEditTourDate'; value: string }
  | { type: 'setEditTourStatus'; value: 'active' | 'archived' }
  | { type: 'closeEdit' }

export function tournamentListEditReducer(
  state: TournamentListEditState,
  action: TournamentListEditAction
): TournamentListEditState {
  switch (action.type) {
    case 'startEdit': {
      const t = action.t
      return {
        editingTournamentId: t.id,
        editTourName: t.name,
        editTourDesc: t.description ?? '',
        editTourDate:
          t.scheduled_date?.slice(0, 10) ?? defaultTournamentDate(),
        editTourStatus: t.status === 'archived' ? 'archived' : 'active',
      }
    }
    case 'setEditTourName':
      return { ...state, editTourName: action.value }
    case 'setEditTourDesc':
      return { ...state, editTourDesc: action.value }
    case 'setEditTourDate':
      return { ...state, editTourDate: action.value }
    case 'setEditTourStatus':
      return { ...state, editTourStatus: action.value }
    case 'closeEdit':
      return { ...initialTournamentListEdit }
    default:
      return state
  }
}
