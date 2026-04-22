export function WarRoomPanel({ agents, topic }: { agents: string[], topic: string }) {
  return (
    <div className="my-4 border border-indigo-200 dark:border-indigo-900/50 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-900">
      <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/50 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2">
            {agents.map((agent, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white dark:border-gray-900 flex items-center justify-center text-[10px] text-white font-bold" title={agent}>
                {agent.charAt(0)}
              </div>
            ))}
          </div>
          <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">War Room: {topic}</span>
        </div>
        <span className="text-xs bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 px-2 py-1 rounded-full font-medium">Active Debate</span>
      </div>
      
      <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto">
        <div className="flex flex-col space-y-3">
          <div className="self-start max-w-[85%]">
            <span className="text-xs text-gray-500 font-medium mb-1 block">{agents[0]}</span>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-2xl rounded-tl-sm text-sm text-gray-800 dark:text-gray-200">
              I propose we architect this using a serverless event-driven model. It scales automatically.
            </div>
          </div>
          
          <div className="self-end max-w-[85%] text-right">
            <span className="text-xs text-indigo-500 font-medium mb-1 block">{agents[1]}</span>
            <div className="bg-indigo-100 dark:bg-indigo-900/40 p-3 rounded-2xl rounded-tr-sm text-sm text-indigo-900 dark:text-indigo-100 text-left">
              Serverless has cold starts. For real-time data, we need sustained WebSockets via persistent containers.
            </div>
          </div>

          <div className="self-start max-w-[85%]">
            <span className="text-xs text-gray-500 font-medium mb-1 block">System</span>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-2 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center justify-center">
              <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Agents are converging on a consensus...
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
